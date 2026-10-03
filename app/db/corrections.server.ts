import { and, eq, inArray, sql } from "drizzle-orm";
import type { Citation, CorrectionTargetType, EditorialCorrection, Filing, Person, SourceDocument, Tenure } from "../archive/types";
import type { ArchiveReader, ArchiveWriter } from "./client.server";
import { canonicalJson } from "./canonical";
import type { ReviewedCorrection } from "./correction-validation";
import { validateReviewedFiling } from "./filing-validation";
import * as schema from "./schema";
import { parsePartialDate, validateTenureEvidence } from "./validation";

export async function readEditorialCorrections(db: ArchiveReader): Promise<EditorialCorrection[]> {
  const table = schema.editorialCorrections;
  const rows = await db.select({ id: table.id, targetType: table.targetType, targetId: table.targetId,
    previousCorrectionId: table.previousCorrectionId, revision: table.revision, reason: table.reason,
    reviewedAt: table.reviewedAt, previousValues: table.previousValues, changes: table.changes, citations: table.citations }).from(table)
    .orderBy(schema.editorialCorrections.targetType, schema.editorialCorrections.targetId, schema.editorialCorrections.revision);
  return rows.map(({ targetType, targetId, ...row }) => ({ ...row, target: { type: targetType, id: targetId } }));
}

/** Changes affect the public projection only. Original rows and citation support are immutable. */
export function projectCorrections<T extends { id: string; citations?: Citation[] }>(type: CorrectionTargetType, record: T, history: EditorialCorrection[]): T {
  const corrections = history.filter(row => row.target.type === type && row.target.id === record.id).sort((a, b) => a.revision - b.revision);
  let result = { ...record };
  for (const correction of corrections) result = { ...result, ...correction.changes };
  if (type === "tenure" && record.citations) {
    const sources = new Map<string, Citation>();
    for (const source of [...record.citations, ...corrections.flatMap(row => row.citations)]) {
      const existing = sources.get(source.id);
      sources.set(source.id, { ...source, supports: [...new Set([...(existing?.supports ?? []), ...source.supports])].sort() });
    }
    result = { ...result, citations: [...sources.values()] };
  }
  return result;
}

type Target =
  | { type: "person"; record: Pick<Person, "id" | "canonicalName" | "nameVariants"> }
  | { type: "tenure"; record: Tenure }
  | { type: "filing"; record: Filing }
  | { type: "source_document"; record: SourceDocument };

function filingRecord(row: typeof schema.filings.$inferSelect): Filing {
  const { reviewedAt: _date, reviewedBy: _reviewer, ...filing } = row;
  const reportingDate = parsePartialDate(filing.reportingDate);
  if (!reportingDate) throw new Error("Stored Filing has no Reporting Date");
  return { ...filing, reportingDate, executionDate: parsePartialDate(filing.executionDate), receiptDate: parsePartialDate(filing.receiptDate) };
}

function documentRecord(row: typeof schema.sourceDocuments.$inferSelect): SourceDocument {
  const acquisitionDate = parsePartialDate(row.acquisitionDate);
  if (!acquisitionDate) throw new Error("Stored Source Document has no Acquisition Date");
  return { ...row, acquisitionDate, officialReleaseDate: parsePartialDate(row.officialReleaseDate) };
}

async function loadTarget(db: ArchiveWriter, target: ReviewedCorrection["target"]): Promise<Target> {
  const id = target.id;
  if (target.type === "person") {
    const [person] = await db.select().from(schema.people).where(eq(schema.people.id, id));
    if (person) {
      const names = await db.select().from(schema.personNames).where(eq(schema.personNames.personId, id));
      return { type: "person", record: { id, canonicalName: person.canonicalName, nameVariants: names.map(row => row.value) } };
    }
  } else if (target.type === "tenure") {
    const [tenure] = await db.select().from(schema.tenures).where(eq(schema.tenures.id, id));
    if (tenure) {
      const citations = await db.select({ source: schema.citations, supports: schema.tenureCitations.supports }).from(schema.citations)
        .innerJoin(schema.tenureCitations, eq(schema.tenureCitations.citationId, schema.citations.id)).where(eq(schema.tenureCitations.tenureId, id));
      return { type: "tenure", record: { ...tenure, startDate: parsePartialDate(tenure.startDate), endDate: parsePartialDate(tenure.endDate),
        citations: citations.map(({ source, supports }) => ({ ...source, supports, publishedDate: parsePartialDate(source.publishedDate) })) } };
    }
  } else if (target.type === "filing") {
    const [filing] = await db.select().from(schema.filings).where(eq(schema.filings.id, id));
    if (filing) return { type: "filing", record: filingRecord(filing) };
  } else {
    const [document] = await db.select().from(schema.sourceDocuments).where(eq(schema.sourceDocuments.id, id));
    if (document) return { type: "source_document", record: documentRecord(document) };
  }
  throw new Error("Editorial Correction target does not exist");
}

export async function checkCitationMetadata(db: ArchiveWriter, citations: Citation[], history: EditorialCorrection[]) {
  const originals = await db.select().from(schema.citations).where(inArray(schema.citations.id, citations.map(row => row.id)));
  const existing = [
    ...originals.map(row => ({ ...row, publishedDate: parsePartialDate(row.publishedDate) })),
    ...history.flatMap(row => row.citations).map(({ supports: _supports, ...row }) => row),
  ];
  for (const { supports: _supports, ...source } of citations) {
    if (existing.some(row => row.id === source.id && canonicalJson(row) !== canonicalJson(source))) throw new Error("Citation ID has different immutable metadata");
  }
}

async function checkEffectiveRecord(db: ArchiveWriter, target: Target, patch: ReviewedCorrection, history: EditorialCorrection[]) {
  if (target.type === "tenure") {
    const before = projectCorrections(target.type, target.record, history);
    for (const fact of before.disputedFacts.filter(fact => patch.changes.disputedFacts && !patch.changes.disputedFacts.includes(fact))) {
      if (!patch.citations.some(source => source.supports.includes(fact))) throw new Error(`${fact} needs dispute resolution evidence`);
    }
    validateTenureEvidence({ ...before, ...patch.changes, citations: [...before.citations, ...patch.citations] });
  } else if (target.type === "filing" || target.type === "source_document") {
    const filingId = target.type === "filing" ? target.record.id : target.record.filingId;
    const [filing] = await db.select().from(schema.filings).where(eq(schema.filings.id, filingId));
    const [document] = await db.select().from(schema.sourceDocuments).where(target.type === "filing" ? eq(schema.sourceDocuments.filingId, filingId) : eq(schema.sourceDocuments.id, target.record.id));
    if (!filing || !document) throw new Error("Correction target has no original Filing and Source Document");
    const effectiveFiling = projectCorrections("filing", filingRecord(filing), history);
    const { storageKey: _key, ...effectiveDocument } = projectCorrections("source_document", documentRecord(document), history);
    // Each Document's immutable manifest retains its own review, including later pages of a Filing.
    // SQLite rowid preserves application order even when two applications share a timestamp.
    const [application] = await db.select({ payload: schema.manifestApplications.canonicalPayload }).from(schema.manifestApplications)
      .where(and(eq(schema.manifestApplications.kind, 'filing'), sql`json_extract(${schema.manifestApplications.canonicalPayload}, '$.payload.document.id') = ${document.id}`))
      .orderBy(sql`rowid`).limit(1);
    if (!application) throw new Error('Source Document needs an applied Filing manifest before correction');
    const originalReview = validateReviewedFiling(JSON.parse(application.payload).payload).review;
    validateReviewedFiling({ review: originalReview,
      filing: target.type === "filing" ? { ...effectiveFiling, ...patch.changes } : effectiveFiling,
      document: target.type === "source_document" ? { ...effectiveDocument, ...patch.changes } : effectiveDocument });
  }
}

/** The manifest application and correction are inserted in the same caller-owned transaction. */
export async function writeReviewedCorrection(db: ArchiveWriter, id: string, patch: ReviewedCorrection, verifyOnly = false) {
  const allHistory = await readEditorialCorrections(db);
  const saved = allHistory.find(row => row.id === id);
  if (verifyOnly && !saved) throw new Error("Editorial Correction is missing from an applied manifest");
  const targetHistory = allHistory.filter(row => row.target.type === patch.target.type && row.target.id === patch.target.id);
  const previousHistory = verifyOnly ? targetHistory.filter(row => row.revision < saved!.revision) : targetHistory;
  const head = previousHistory.at(-1);
  if ((head?.id ?? null) !== patch.previousCorrectionId) throw new Error("Editorial Correction predecessor does not match the target's latest correction");
  if (head && patch.review.reviewedAt < head.reviewedAt) throw new Error("Correction review date precedes its predecessor");
  const original = await loadTarget(db, patch.target);
  const before = projectCorrections(original.type, original.record, previousHistory);
  const previousValues = Object.fromEntries(Object.keys(patch.changes).map(key => [key, Reflect.get(before, key)]));
  const existingCitations = [...(original.type === "tenure" ? original.record.citations : []), ...previousHistory.flatMap(row => row.citations)];
  const addsEvidence = patch.citations.some(source => source.supports.some(fact => !existingCitations.some(existing => existing.id === source.id && existing.supports.includes(fact))));
  if (!verifyOnly && !addsEvidence && !Object.keys(patch.changes).some(key => canonicalJson(Reflect.get(before, key)) !== canonicalJson(Reflect.get(patch.changes, key)))) throw new Error("Editorial Correction does not change the target or add evidence");
  await checkCitationMetadata(db, patch.citations, allHistory);
  // Other targets keep their current overlays; this target is checked at its exact revision on replay.
  const effectiveHistory = [...allHistory.filter(row => row.target.type !== patch.target.type || row.target.id !== patch.target.id), ...previousHistory];
  await checkEffectiveRecord(db, original, patch, effectiveHistory);
  const expected: EditorialCorrection = {
    id, target: patch.target, previousCorrectionId: patch.previousCorrectionId, revision: (head?.revision ?? 0) + 1,
    reason: patch.reason, reviewedAt: patch.review.reviewedAt, previousValues, changes: patch.changes, citations: patch.citations,
  };
  if (verifyOnly) {
    if (canonicalJson(saved) !== canonicalJson(expected)) throw new Error("Stored Editorial Correction differs from its applied manifest");
    const [row] = await db.select().from(schema.editorialCorrections).where(eq(schema.editorialCorrections.id, id));
    if (row.reviewedBy !== patch.review.reviewedBy) throw new Error("Stored correction review differs from its applied manifest");
  } else {
    const { target, ...row } = expected;
    await db.insert(schema.editorialCorrections).values({ ...row, targetType: target.type, targetId: target.id, reviewedBy: patch.review.reviewedBy });
  }
}
