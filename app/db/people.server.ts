import { and, eq, inArray, sql } from "drizzle-orm";
import type { Archive, Citation, PersonRecord } from "../archive/types";
import { readArchiveTransaction, type ArchiveDatabase, type ArchiveReader, type ArchiveWriter } from "./client.server";
import * as schema from "./schema";
import { hasEligibleTenure, parsePartialDate, validateReviewedPerson, type ReviewedPerson } from "./validation";
import { missingRows } from "./canonical";
import { personIsEligible, tenureIsVerified } from "./eligibility";
import { findPublicSourceDocument, readPublicSourceDocument, sourceDocumentFromRow } from "./filings.server";
import { checkCitationMetadata, projectCorrections, readEditorialCorrections } from "./corrections.server";
import { checkPersonIdentifiers, findPersonIdentifier, identityLineage, readIdentityMatches } from "./identities.server";
import { isLatestRosterSnapshot, readArchiveHome, tenureCoversRosterDate } from "./rosters.server";
import { readFinancialSummaries, readSecondaryReports, withTranscriptionLevels } from "./transcriptions.server";
import { readDirectory } from './directory.server';

/** Apply immutable rows inside the caller's transaction, or verify an earlier application. */
export async function writeReviewedPerson(tx: ArchiveWriter, record: ReviewedPerson, verifyOnly = false) {
  const corrections = await readEditorialCorrections(tx);
  await checkCitationMetadata(tx, record.tenures.flatMap(tenure => tenure.citations), corrections);
  const { nameVariants, ...person } = record.person;
  await checkPersonIdentifiers(tx, [person.id, person.slug].map(value => ({ value, personId: person.id })));
  const personRows = missingRows(await tx.select().from(schema.people).where(eq(schema.people.id, person.id)), [{ ...person, ...record.review }], row => row.id, "Person", verifyOnly);
  if (personRows.length) await tx.insert(schema.people).values(personRows);
  const names = nameVariants.map(value => ({ personId: person.id, value }));
  const missingNames = missingRows(await tx.select().from(schema.personNames).where(eq(schema.personNames.personId, person.id)), names, row => row.value, "Name Variant", verifyOnly);
  if (missingNames.length && corrections.some(row => row.target.type === "person" && row.target.id === person.id && Object.hasOwn(row.changes, "nameVariants"))) {
    throw new Error("Name Variants already have an Editorial Correction; add names through a new correction");
  }
  if (missingNames.length) await tx.insert(schema.personNames).values(missingNames);
  if (record.jurisdictions.length) {
    const rows = missingRows(await tx.select().from(schema.jurisdictions).where(inArray(schema.jurisdictions.id, record.jurisdictions.map(row => row.id))), record.jurisdictions, row => row.id, "Jurisdiction", verifyOnly);
    if (rows.length) await tx.insert(schema.jurisdictions).values(rows);
  }
  if (record.jurisdictionRelationships.length) {
    const rows = missingRows(await tx.select().from(schema.jurisdictionRelationships).where(inArray(schema.jurisdictionRelationships.fromId, record.jurisdictions.map(row => row.id))), record.jurisdictionRelationships, row => JSON.stringify([row.fromId, row.toId, row.kind]), "Jurisdiction Relationship", verifyOnly);
    if (rows.length) await tx.insert(schema.jurisdictionRelationships).values(rows);
  }
  if (record.offices.length) {
    const rows = missingRows(await tx.select().from(schema.offices).where(inArray(schema.offices.id, record.offices.map(row => row.id))), record.offices, row => row.id, "Office", verifyOnly);
    if (rows.length) await tx.insert(schema.offices).values(rows);
  }
  if (record.constituencies.length) {
    const rows = missingRows(await tx.select().from(schema.constituencies).where(inArray(schema.constituencies.id, record.constituencies.map(row => row.id))), record.constituencies, row => row.id, "Constituency", verifyOnly);
    if (rows.length) await tx.insert(schema.constituencies).values(rows);
  }
  if (record.electoralTerms.length) {
    const terms = record.electoralTerms.map(term => ({ ...term, startDate: term.startDate?.value ?? null, endDate: term.endDate?.value ?? null }));
    const rows = missingRows(await tx.select().from(schema.electoralTerms).where(inArray(schema.electoralTerms.id, terms.map(row => row.id))), terms, row => row.id, "Electoral Term", verifyOnly);
    if (rows.length) await tx.insert(schema.electoralTerms).values(rows);
  }
  const citations = [...new Map(record.tenures.flatMap(tenure => tenure.citations).map(source => {
    const { supports, ...metadata } = source;
    return [source.id, { ...metadata, publishedDate: source.publishedDate?.value ?? null }];
  })).values()];
  if (citations.length) {
    const rows = missingRows(await tx.select().from(schema.citations).where(inArray(schema.citations.id, citations.map(row => row.id))), citations, row => row.id, "Citation", verifyOnly);
    if (rows.length) await tx.insert(schema.citations).values(rows);
  }
  for (const tenure of record.tenures) {
    const { citations: sources, ...fields } = tenure;
    const rows = missingRows(await tx.select().from(schema.tenures).where(eq(schema.tenures.id, tenure.id)), [{ ...fields, startDate: tenure.startDate?.value ?? null, endDate: tenure.endDate?.value ?? null }], row => row.id, "Tenure", verifyOnly);
    if (rows.length) await tx.insert(schema.tenures).values(rows);
    const citations = sources.map(source => ({ tenureId: tenure.id, citationId: source.id, supports: source.supports }));
    const links = missingRows(await tx.select().from(schema.tenureCitations).where(eq(schema.tenureCitations.tenureId, tenure.id)), citations, row => row.citationId, "Tenure Citation", verifyOnly);
    if (links.length) await tx.insert(schema.tenureCitations).values(links);
  }
}

export async function importReviewedPerson(db: ArchiveDatabase, input: unknown) {
  const record = validateReviewedPerson(input);
  await db.transaction(tx => writeReviewedPerson(tx, record));
  return { personId: record.person.id, eligible: hasEligibleTenure(record) };
}

export function createDbArchive(db: ArchiveDatabase): Archive {
  async function readPerson(db: ArchiveReader, person: typeof schema.people.$inferSelect): Promise<PersonRecord> {
    const matches = await readIdentityMatches(db);
    const lineage = identityLineage(person.id, matches);
    const [names, formerPeople, aliases, tenures, corrections] = await Promise.all([
      db.select().from(schema.personNames).where(inArray(schema.personNames.personId, lineage)),
      db.select().from(schema.people).where(inArray(schema.people.id, lineage)),
      db.select().from(schema.personAliases).where(inArray(schema.personAliases.personId, lineage)),
      db.select().from(schema.tenures).where(inArray(schema.tenures.personId, lineage)),
      readEditorialCorrections(db),
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
        .innerJoin(schema.tenures, eq(schema.tenures.id, schema.tenureCitations.tenureId)).where(inArray(schema.tenures.personId, lineage)),
    ]);
    const jurisdictionIds = [...offices, ...constituencies].flatMap(row => row.jurisdictionId ? [row.jurisdictionId] : []);
    const record: PersonRecord = {
      person: { id: person.id, slug: person.slug, canonicalName: person.canonicalName, nameVariants: names.filter(name => name.personId === person.id).map(name => name.value),
        legacySlugs: [...new Set([...formerPeople.map(row => row.slug), ...aliases.filter(row => row.kind === "slug").map(row => row.value)])].filter(slug => slug !== person.slug).sort(), eligibility: "unverified" },
      offices, constituencies,
      jurisdictions: jurisdictionIds.length ? await db.select().from(schema.jurisdictions).where(inArray(schema.jurisdictions.id, jurisdictionIds)) : [],
      electoralTerms: terms.map(term => ({ ...term, startDate: parsePartialDate(term.startDate), endDate: parsePartialDate(term.endDate) })),
      tenures: tenures.map(tenure => ({
        ...tenure, startDate: parsePartialDate(tenure.startDate), endDate: parsePartialDate(tenure.endDate),
        citations: sources.filter(source => source.tenureId === tenure.id).map(({ source, supports }): Citation => ({ ...source, supports, publishedDate: parsePartialDate(source.publishedDate) })),
      })),
      filings: [], sourceDocuments: [], financialSummaries: [],
      identityMatches: matches.filter(row => lineage.includes(row.fromPersonId)),
    };
    record.person = projectCorrections("person", record.person, corrections);
    const formerNames = formerPeople.filter(row => row.id !== person.id).flatMap(row => {
      const projected = projectCorrections("person", { ...row, nameVariants: names.filter(name => name.personId === row.id).map(name => name.value) }, corrections);
      return [row.canonicalName, projected.canonicalName, ...projected.nameVariants];
    });
    record.person.nameVariants = [...new Set([...record.person.nameVariants, ...formerNames])].filter(name => name !== record.person.canonicalName).sort();
    record.tenures = record.tenures.map(tenure => ({ ...projectCorrections("tenure", tenure, corrections), personId: person.id }));
    record.person.eligibility = hasEligibleTenure(record) ? "eligible" : record.tenures.some(tenure =>
      tenure.disputedFacts.some(fact => fact === "person" || fact === "office")) ? "disputed" : "unverified";
    if (record.person.eligibility === "eligible") {
      const [filingRows, documentRows] = await Promise.all([
        db.select().from(schema.filings).where(inArray(schema.filings.personId, lineage)).orderBy(schema.filings.reportingDate, schema.filings.id),
        db.select({ document: schema.sourceDocuments }).from(schema.sourceDocuments).innerJoin(schema.filings, eq(schema.filings.id, schema.sourceDocuments.filingId))
          .where(inArray(schema.filings.personId, lineage))
          .orderBy(schema.sourceDocuments.archivePublicationDate, schema.sourceDocuments.id),
      ]);
      record.filings = filingRows.map(row => {
        const { reviewedAt, reviewedBy, ...filing } = row;
        const reportingDate = parsePartialDate(filing.reportingDate);
        if (!reportingDate) throw new Error("Stored Filing has no Reporting Date");
        return { ...projectCorrections("filing", { ...filing, reportingDate, executionDate: parsePartialDate(filing.executionDate), receiptDate: parsePartialDate(filing.receiptDate) }, corrections), personId: person.id };
      });
      record.filings.sort((a, b) => a.reportingDate.value < b.reportingDate.value ? -1 : a.reportingDate.value > b.reportingDate.value ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      record.sourceDocuments = documentRows.map(({ document }) => projectCorrections("source_document", sourceDocumentFromRow(document), corrections))
        .sort((a, b) => a.archivePublicationDate < b.archivePublicationDate ? -1 : a.archivePublicationDate > b.archivePublicationDate ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      record.financialSummaries = await readFinancialSummaries(db, record.filings.map(filing => filing.id), corrections);
      record.sourceDocuments = withTranscriptionLevels(record.sourceDocuments, record.financialSummaries);
      record.relatedReports = (await readSecondaryReports(db, lineage, corrections)).map(report => ({ ...report, personId: person.id }));
      record.rosterMemberships = await db.select({ snapshotId: schema.rosterSnapshots.id, scope: schema.rosterSnapshots.scope, verifiedAsOf: schema.rosterSnapshots.verifiedAsOf, tenureId: schema.rosterMembers.tenureId }).from(schema.rosterMembers)
        .innerJoin(schema.rosterSnapshots, eq(schema.rosterSnapshots.id, schema.rosterMembers.snapshotId)).innerJoin(schema.tenures, eq(schema.tenures.id, schema.rosterMembers.tenureId)).where(and(inArray(schema.rosterMembers.tenureId, record.tenures.map(tenure => tenure.id)), tenureIsVerified(), tenureCoversRosterDate(schema.rosterSnapshots.verifiedAsOf),
          isLatestRosterSnapshot())).orderBy(schema.rosterSnapshots.scope, schema.rosterMembers.position);
    }
    record.editorialCorrections = corrections.filter(row => row.target.type === "person" ? lineage.includes(row.target.id) :
      row.target.type === "tenure" ? record.tenures.some(tenure => tenure.id === row.target.id) :
        row.target.type === "filing" ? record.filings.some(filing => filing.id === row.target.id) :
          row.target.type === "source_document" ? record.sourceDocuments.some(document => document.id === row.target.id) :
            row.target.type === "financial_summary" ? record.financialSummaries.some(summary => summary.id === row.target.id) :
              row.target.type === "secondary_report" && record.relatedReports?.some(report => report.id === row.target.id));
    return record;
  }
  return {
    browsePeople(filters) { return readArchiveTransaction(db, tx => readDirectory(tx, filters)); },
    readHome() { return readArchiveTransaction(db, readArchiveHome); },
    findSourceDocument(sha256) { return findPublicSourceDocument(db, sha256); },
    async findLegacyDocument(path) {
      return readArchiveTransaction(db, async tx => {
        const [link] = await tx.select().from(schema.legacyDocuments).where(eq(schema.legacyDocuments.path, path));
        return link ? readPublicSourceDocument(tx, link.sha256, link.sourceDocumentId) : null;
      });
    },
    async listPeople() {
      return readArchiveTransaction(db, async tx => {
        // ponytail: one read per Person for the small first roster; paginate in the directory query slice.
        const people = await tx.select().from(schema.people).where(personIsEligible()).orderBy(schema.people.canonicalName, schema.people.id);
        const records = await Promise.all(people.map(person => readPerson(tx, person)));
        return records.sort((a, b) => a.person.canonicalName.localeCompare(b.person.canonicalName) || a.person.id.localeCompare(b.person.id));
      });
    },
    async findPersonBySlug(slug) {
      return readArchiveTransaction(db, async tx => {
        const person = await findPersonIdentifier(tx, slug);
        return person ? readPerson(tx, person) : null;
      });
    },
  };
}
