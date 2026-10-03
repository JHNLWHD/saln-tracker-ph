import { and, desc, eq, inArray, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import type { ArchiveHome, Citation, CorrectionTargetType, RosterSnapshot } from "../archive/types";
import type { ArchiveReader, ArchiveWriter } from "./client.server";
import { missingRows } from "./canonical";
import { checkCitationMetadata, projectCorrections, readEditorialCorrections } from "./corrections.server";
import { personIsEligible, tenureIsVerified as publicTenure } from "./eligibility";
import { canonicalPersonId } from "./identities.server";
import * as schema from "./schema";
import { choice, citation, object, parsePartialDate, text, validateTenureEvidence } from "./validation";

export interface ReviewedRoster {
  review: { reviewedAt: string; reviewedBy: string };
  scope: RosterSnapshot["scope"];
  verifiedAsOf: string;
  members: RosterSnapshot["members"];
}

export function validateReviewedRoster(value: unknown): ReviewedRoster {
  const root = object(value, ["review", "scope", "verifiedAsOf", "members"], "roster");
  const review = object(root.review, ["reviewedAt", "reviewedBy"], "review");
  const reviewedAt = text(review.reviewedAt, "review.reviewedAt"), verifiedAsOf = text(root.verifiedAsOf, "verifiedAsOf");
  if (parsePartialDate(reviewedAt)?.precision !== "day" || parsePartialDate(verifiedAsOf)?.precision !== "day" || verifiedAsOf > reviewedAt) throw new Error("Roster dates must be calendar dates with review on or after verification");
  if (!Array.isArray(root.members) || !root.members.length || root.members.length > 1000) throw new Error("A Roster Snapshot needs 1–1000 reviewed members");
  const members = root.members.map((value, i) => {
    const row = object(value, ["tenureId", "citations"], `members[${i}]`);
    if (!Array.isArray(row.citations)) throw new Error("Roster citations must be an array");
    const citations = row.citations.map((source, j) => citation(source, `members[${i}].citations[${j}]`, ["person", "office", "holdsOffice"]));
    if (!citations.some(source => ["person", "office", "holdsOffice"].every(fact => source.supports.includes(fact)) && source.publishedDate?.precision === "day" && source.publishedDate.value <= verifiedAsOf)) throw new Error("Roster membership needs attributable dated evidence of holding the Office");
    if (new Set(citations.map(source => source.id)).size !== citations.length) throw new Error("Duplicate Roster citation");
    return { tenureId: text(row.tenureId, "tenureId"), citations };
  });
  if (new Set(members.map(row => row.tenureId)).size !== members.length) throw new Error("Duplicate Roster Tenure");
  return { review: { reviewedAt, reviewedBy: text(review.reviewedBy, "review.reviewedBy") }, scope: choice(root.scope, ["executive", "senate", "speaker", "house", "local"], "scope"), verifiedAsOf, members };
}

/** A CASE preserves an explicit corrected null; COALESCE would restore the old fact. */
export function effectiveField<T>(type: CorrectionTargetType, id: SQLWrapper, field: string, original: SQLWrapper): SQL<T> {
  const path = `$.${field}`;
  return sql<T>`case when exists (select 1 from ${schema.editorialCorrections}
    where ${schema.editorialCorrections.targetType} = ${type} and ${schema.editorialCorrections.targetId} = ${id} and json_type(${schema.editorialCorrections.changes}, ${path}) is not null)
    then (select json_extract(${schema.editorialCorrections.changes}, ${path}) from ${schema.editorialCorrections}
      where ${schema.editorialCorrections.targetType} = ${type} and ${schema.editorialCorrections.targetId} = ${id} and json_type(${schema.editorialCorrections.changes}, ${path}) is not null
      order by ${schema.editorialCorrections.revision} desc limit 1) else ${original} end`;
}

/** Corrected actual boundaries must still contain the historical Snapshot date. */
export function tenureCoversRosterDate(date: SQLWrapper) {
  const start = sql`json_extract(${effectiveField('tenure', schema.tenures.id, 'startDate', sql`json_object('value', ${schema.tenures.startDate})`)}, '$.value')`;
  const end = sql`json_extract(${effectiveField('tenure', schema.tenures.id, 'endDate', sql`json_object('value', ${schema.tenures.endDate})`)}, '$.value')`;
  return sql`(${start} is null or ${start} <= substr(${date}, 1, length(${start}))) and (${end} is null or ${end} >= substr(${date}, 1, length(${end})))`;
}

// National scopes refer to the durable Office IDs used by the reviewed manifests.
const nationalRosterOffices = {
  executive: ['office-president-ph', 'office-vice-president-ph'],
  senate: ['office-senator-ph', 'office-senate-president-ph'], speaker: ['office-house-speaker-ph'], house: ['office-house-representative-ph'],
};

export async function writeReviewedRoster(tx: ArchiveWriter, id: string, record: ReviewedRoster, verifyOnly = false) {
  const corrections = await readEditorialCorrections(tx);
  await checkCitationMetadata(tx, record.members.flatMap(row => row.citations), corrections);
  for (const member of record.members) {
    const [row] = await tx.select({ tenure: schema.tenures, office: schema.offices, jurisdictionKind: schema.jurisdictions.kind }).from(schema.tenures)
      .innerJoin(schema.offices, eq(schema.offices.id, schema.tenures.officeId)).innerJoin(schema.people, eq(schema.people.id, canonicalPersonId(schema.tenures.personId)))
      .leftJoin(schema.jurisdictions, eq(schema.jurisdictions.id, schema.offices.jurisdictionId))
      .where(and(eq(schema.tenures.id, member.tenureId), verifyOnly ? undefined : personIsEligible(), verifyOnly ? undefined : publicTenure()));
    if (!row?.office.included) throw new Error("Roster member needs a reviewed Tenure in an included Office and an Archive-Eligible Person");
    const matchesScope = record.scope === 'local'
      ? row.office.kind === 'elected' && row.jurisdictionKind !== null && row.jurisdictionKind !== 'country' && !Object.values(nationalRosterOffices).flat().includes(row.office.id)
      : nationalRosterOffices[record.scope].includes(row.office.id);
    if (!matchesScope) throw new Error('Roster member Office does not match the declared scope');
    const sources = await tx.select({ citation: schema.citations, supports: schema.tenureCitations.supports }).from(schema.tenureCitations)
      .innerJoin(schema.citations, eq(schema.citations.id, schema.tenureCitations.citationId)).where(eq(schema.tenureCitations.tenureId, member.tenureId));
    const tenure = projectCorrections("tenure", { ...row.tenure, startDate: parsePartialDate(row.tenure.startDate), endDate: parsePartialDate(row.tenure.endDate),
      citations: sources.map(({ citation, supports }): Citation => ({ ...citation, supports, publishedDate: parsePartialDate(citation.publishedDate) })) }, verifyOnly ? [] : corrections);
    validateTenureEvidence(tenure);
    if (tenure.startDate && tenure.startDate.value > record.verifiedAsOf || tenure.endDate && tenure.endDate.value < record.verifiedAsOf.slice(0, tenure.endDate.value.length)) throw new Error("Tenure does not include the Roster Snapshot date");
  }
  const rows = missingRows(await tx.select().from(schema.rosterSnapshots).where(eq(schema.rosterSnapshots.id, id)), [{ id, scope: record.scope, verifiedAsOf: record.verifiedAsOf, ...record.review }], row => row.id, "Roster Snapshot", verifyOnly);
  if (rows.length) await tx.insert(schema.rosterSnapshots).values(rows);
  const members = record.members.map((member, position) => ({ snapshotId: id, ...member, position }));
  const entries = missingRows(await tx.select().from(schema.rosterMembers).where(eq(schema.rosterMembers.snapshotId, id)), members, row => row.tenureId, "Roster member", verifyOnly);
  if (entries.length) await tx.insert(schema.rosterMembers).values(entries);
}

/** Equal-date replacements use their later review before the stable ID tie-breaker. */
export function isLatestRosterSnapshot() {
  return sql`not exists (select 1 from roster_snapshots newer where newer.scope = ${schema.rosterSnapshots.scope}
    and (newer.verified_as_of > ${schema.rosterSnapshots.verifiedAsOf} or (newer.verified_as_of = ${schema.rosterSnapshots.verifiedAsOf}
      and (newer.reviewed_at > ${schema.rosterSnapshots.reviewedAt} or (newer.reviewed_at = ${schema.rosterSnapshots.reviewedAt} and newer.id < ${schema.rosterSnapshots.id})))))`;
}

export async function readRosterSnapshots(tx: ArchiveReader, homepage = false): Promise<RosterSnapshot[]> {
  const snapshots = await tx.select({ id: schema.rosterSnapshots.id, scope: schema.rosterSnapshots.scope, verifiedAsOf: schema.rosterSnapshots.verifiedAsOf, reviewedAt: schema.rosterSnapshots.reviewedAt })
    .from(schema.rosterSnapshots).where(homepage ? and(inArray(schema.rosterSnapshots.scope, ["executive", "senate", "speaker"]), isLatestRosterSnapshot()) : undefined)
    .orderBy(schema.rosterSnapshots.scope, desc(schema.rosterSnapshots.verifiedAsOf), desc(schema.rosterSnapshots.reviewedAt), schema.rosterSnapshots.id);
  const members = await tx.select().from(schema.rosterMembers).where(inArray(schema.rosterMembers.snapshotId, snapshots.map(row => row.id))).orderBy(schema.rosterMembers.snapshotId, schema.rosterMembers.position);
  return snapshots.map(snapshot => ({ ...snapshot, members: members.filter(member => member.snapshotId === snapshot.id).map(({ tenureId, citations }) => ({ tenureId, citations })) }));
}

export async function readArchiveHome(tx: ArchiveReader): Promise<ArchiveHome> {
  const latest = await readRosterSnapshots(tx, true);
  const rosters: ArchiveHome["rosters"] = [];
  for (const snapshot of latest) {
    const rows = await tx.select({ tenureId: schema.tenures.id, personId: schema.people.id, slug: schema.people.slug,
      canonicalName: effectiveField<string>("person", schema.people.id, "canonicalName", schema.people.canonicalName), officeName: schema.offices.name,
      documentCount: sql<number>`(select count(distinct ${schema.sourceDocuments.sha256}) from ${schema.sourceDocuments} inner join ${schema.filings} on ${schema.filings.id} = ${schema.sourceDocuments.filingId} where ${canonicalPersonId(schema.filings.personId)} = ${schema.people.id})`.mapWith(Number),
    }).from(schema.tenures).innerJoin(schema.people, eq(schema.people.id, canonicalPersonId(schema.tenures.personId))).innerJoin(schema.offices, eq(schema.offices.id, schema.tenures.officeId))
      .innerJoin(schema.rosterMembers, and(eq(schema.rosterMembers.tenureId, schema.tenures.id), eq(schema.rosterMembers.snapshotId, snapshot.id)))
      .where(and(inArray(schema.tenures.id, snapshot.members.map(member => member.tenureId)), personIsEligible(), publicTenure(), eq(schema.offices.included, true), tenureCoversRosterDate(sql`${snapshot.verifiedAsOf}`))).orderBy(schema.rosterMembers.position);
    rosters.push({ snapshot, rows: rows.map(row => ({ ...row, latestSummary: null })) });
  }
  const recent = tx.select({ id: schema.sourceDocuments.id, sha256: schema.sourceDocuments.sha256, fileName: effectiveField<string>("source_document", schema.sourceDocuments.id, "fileName", schema.sourceDocuments.fileName).as("file_name"),
    archivePublicationDate: effectiveField<string>("source_document", schema.sourceDocuments.id, "archivePublicationDate", schema.sourceDocuments.archivePublicationDate).as("publication_date"),
    reportingDate: effectiveField<string>("filing", schema.filings.id, "reportingDate.value", schema.filings.reportingDate).as("reporting_date"),
    canonicalName: effectiveField<string>("person", schema.people.id, "canonicalName", schema.people.canonicalName).as("canonical_name"), slug: schema.people.slug,
    rank: sql<number>`row_number() over (partition by ${schema.sourceDocuments.sha256} order by ${effectiveField("source_document", schema.sourceDocuments.id, "archivePublicationDate", schema.sourceDocuments.archivePublicationDate)} desc, ${schema.sourceDocuments.id})`.as("copy_rank"),
  }).from(schema.sourceDocuments).innerJoin(schema.filings, eq(schema.filings.id, schema.sourceDocuments.filingId)).innerJoin(schema.people, eq(schema.people.id, canonicalPersonId(schema.filings.personId)))
    .where(personIsEligible()).as("recent_documents");
  const documents = await tx.select().from(recent).where(eq(recent.rank, 1)).orderBy(desc(recent.archivePublicationDate), recent.id).limit(8);
  return { rosters, recentlyAdded: documents.map(({ rank, reportingDate, ...row }) => ({ ...row, reportingDate: parsePartialDate(reportingDate)! })) };
}
