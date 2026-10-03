import { eq, inArray, sql } from "drizzle-orm";
import type { Archive, Citation, PersonRecord } from "../archive/types";
import type { ArchiveDatabase } from "./client.server";
import * as schema from "./schema";
import { hasEligibleTenure, parsePartialDate, validateReviewedPerson } from "./validation";

function unchanged<T extends { id: string }>(existing: T[], incoming: T[], entity: string) {
  for (const row of incoming) {
    const saved = existing.find(item => item.id === row.id);
    if (saved && Object.entries(row).some(([key, value]) => JSON.stringify(saved[key as keyof T]) !== JSON.stringify(value))) {
      throw new Error(`${entity} ${row.id} already exists with different metadata; use an Editorial Correction`);
    }
  }
}

/** Publication accepts reviewed metadata only, and never rewrites an existing identity. */
export async function importReviewedPerson(db: ArchiveDatabase, input: unknown) {
  const record = validateReviewedPerson(input);
  const terms = record.electoralTerms.map(term => ({ ...term, startDate: term.startDate?.value ?? null, endDate: term.endDate?.value ?? null }));
  const citations = [...new Map(record.tenures.flatMap(tenure => tenure.citations).map(source => {
    const { supports, ...metadata } = source;
    return [source.id, { ...metadata, publishedDate: source.publishedDate?.value ?? null }];
  })).values()];
  await db.transaction(async tx => {
    const { nameVariants, ...person } = record.person;
    await tx.insert(schema.people).values({ ...person, ...record.review });
    if (nameVariants.length) await tx.insert(schema.personNames).values(nameVariants.map(value => ({ personId: person.id, value })));
    if (record.jurisdictions.length) {
      unchanged(await tx.select().from(schema.jurisdictions).where(inArray(schema.jurisdictions.id, record.jurisdictions.map(row => row.id))), record.jurisdictions, "Jurisdiction");
      await tx.insert(schema.jurisdictions).values(record.jurisdictions).onConflictDoNothing();
    }
    if (record.jurisdictionRelationships.length) await tx.insert(schema.jurisdictionRelationships).values(record.jurisdictionRelationships).onConflictDoNothing();
    if (record.offices.length) {
      unchanged(await tx.select().from(schema.offices).where(inArray(schema.offices.id, record.offices.map(row => row.id))), record.offices, "Office");
      await tx.insert(schema.offices).values(record.offices).onConflictDoNothing();
    }
    if (record.constituencies.length) {
      unchanged(await tx.select().from(schema.constituencies).where(inArray(schema.constituencies.id, record.constituencies.map(row => row.id))), record.constituencies, "Constituency");
      await tx.insert(schema.constituencies).values(record.constituencies).onConflictDoNothing();
    }
    if (terms.length) {
      unchanged(await tx.select().from(schema.electoralTerms).where(inArray(schema.electoralTerms.id, terms.map(row => row.id))), terms, "Electoral Term");
      await tx.insert(schema.electoralTerms).values(terms).onConflictDoNothing();
    }
    if (citations.length) {
      unchanged(await tx.select().from(schema.citations).where(inArray(schema.citations.id, citations.map(row => row.id))), citations, "Citation");
      await tx.insert(schema.citations).values(citations).onConflictDoNothing();
    }
    for (const tenure of record.tenures) {
      const { citations: sources, ...fields } = tenure;
      await tx.insert(schema.tenures).values({ ...fields, startDate: tenure.startDate?.value ?? null, endDate: tenure.endDate?.value ?? null });
      if (sources.length) await tx.insert(schema.tenureCitations).values(sources.map(source => ({ tenureId: tenure.id, citationId: source.id, supports: source.supports })));
    }
  });
  return { personId: record.person.id, eligible: hasEligibleTenure(record) };
}

export function createDbArchive(db: ArchiveDatabase): Archive {
  async function readPerson(person: typeof schema.people.$inferSelect): Promise<PersonRecord> {
    const [names, tenures] = await Promise.all([
      db.select().from(schema.personNames).where(eq(schema.personNames.personId, person.id)),
      db.select().from(schema.tenures).where(eq(schema.tenures.personId, person.id)),
    ]);
    const officeIds = tenures.map(tenure => tenure.officeId);
    const constituencyIds = tenures.flatMap(tenure => tenure.constituencyId ? [tenure.constituencyId] : []);
    const termIds = tenures.flatMap(tenure => tenure.electoralTermId ? [tenure.electoralTermId] : []);
    const [offices, constituencies, terms, sources] = await Promise.all([
      officeIds.length ? db.select().from(schema.offices).where(inArray(schema.offices.id, officeIds)) : [],
      constituencyIds.length ? db.select().from(schema.constituencies).where(inArray(schema.constituencies.id, constituencyIds)) : [],
      termIds.length ? db.select().from(schema.electoralTerms).where(inArray(schema.electoralTerms.id, termIds)) : [],
      db.select({ source: schema.citations, tenureId: schema.tenureCitations.tenureId, supports: schema.tenureCitations.supports })
        .from(schema.citations).innerJoin(schema.tenureCitations, eq(schema.citations.id, schema.tenureCitations.citationId))
        .innerJoin(schema.tenures, eq(schema.tenures.id, schema.tenureCitations.tenureId)).where(eq(schema.tenures.personId, person.id)),
    ]);
    const jurisdictionIds = [...offices, ...constituencies].flatMap(row => row.jurisdictionId ? [row.jurisdictionId] : []);
    const record: PersonRecord = {
      person: { id: person.id, slug: person.slug, canonicalName: person.canonicalName, nameVariants: names.map(name => name.value), legacySlugs: [], eligibility: "unverified" },
      offices, constituencies,
      jurisdictions: jurisdictionIds.length ? await db.select().from(schema.jurisdictions).where(inArray(schema.jurisdictions.id, jurisdictionIds)) : [],
      electoralTerms: terms.map(term => ({ ...term, startDate: parsePartialDate(term.startDate), endDate: parsePartialDate(term.endDate) })),
      tenures: tenures.map(tenure => ({
        ...tenure, startDate: parsePartialDate(tenure.startDate), endDate: parsePartialDate(tenure.endDate),
        citations: sources.filter(source => source.tenureId === tenure.id).map(({ source, supports }): Citation => ({ ...source, supports, publishedDate: parsePartialDate(source.publishedDate) })),
      })),
      filings: [], sourceDocuments: [], financialSummaries: [],
    };
    record.person.eligibility = hasEligibleTenure(record) ? "eligible" : record.tenures.some(tenure =>
      tenure.disputedFacts.some(fact => fact === "person" || fact === "office")) ? "disputed" : "unverified";
    return record;
  }
  return {
    async listPeople() {
      // ponytail: one read per Person for the small first roster; paginate in the directory query slice.
      const people = await db.select().from(schema.people).where(sql`exists (
        select 1 from ${schema.tenures}
        inner join ${schema.offices} on ${schema.offices.id} = ${schema.tenures.officeId}
        inner join ${schema.tenureCitations} on ${schema.tenureCitations.tenureId} = ${schema.tenures.id}
        inner join ${schema.citations} on ${schema.citations.id} = ${schema.tenureCitations.citationId}
        where ${schema.tenures.personId} = ${schema.people.id}
          and ${schema.offices.included} = 1 and ${schema.offices.kind} = 'elected'
          and ${schema.tenures.verificationStatus} != 'unverified'
          and not exists (select 1 from json_each(${schema.tenures.disputedFacts}) where value in ('person','office'))
          and exists (select 1 from json_each(${schema.tenureCitations.supports}) where value = 'person')
          and exists (select 1 from json_each(${schema.tenureCitations.supports}) where value = 'office')
      )`).orderBy(schema.people.canonicalName, schema.people.id);
      return Promise.all(people.map(readPerson));
    },
    async findPersonBySlug(slug) {
      const [person] = await db.select().from(schema.people).where(eq(schema.people.slug, slug)).limit(1);
      return person ? readPerson(person) : null;
    },
  };
}
