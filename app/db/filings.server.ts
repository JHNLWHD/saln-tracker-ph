import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { SourceDocument } from "../archive/types";
import { documentStorageKey, type DocumentStorage } from "../storage/objects.server";
import { readArchiveTransaction, type ArchiveDatabase, type ArchiveReader, type ArchiveWriter } from "./client.server";
import { personIsEligible, requireEligiblePerson } from "./eligibility";
export { requireEligiblePerson } from "./eligibility";
import { validateReviewedFiling, type ReviewedFiling } from "./filing-validation";
import { missingRows } from "./canonical";
import { filings, manifestApplications, people, sourceDocuments } from "./schema";
import { parsePartialDate } from "./validation";
import { projectCorrections, readEditorialCorrections } from "./corrections.server";
import { canonicalPersonId } from "./identities.server";
import { readFinancialSummaries, withTranscriptionLevels } from "./transcriptions.server";

export function sourceDocumentFromRow(row: typeof sourceDocuments.$inferSelect): SourceDocument {
  const { storageKey: _key, ...document } = row;
  const acquisitionDate = parsePartialDate(row.acquisitionDate);
  if (!acquisitionDate) throw new Error("Stored Source Document has no Acquisition Date");
  return { ...document, acquisitionDate, officialReleaseDate: parsePartialDate(row.officialReleaseDate) };
}

export async function findPublicSourceDocument(db: ArchiveDatabase, sha256: string): Promise<SourceDocument | null> {
  return readArchiveTransaction(db, tx => readPublicSourceDocument(tx, sha256));
}

export async function readPublicSourceDocument(tx: ArchiveReader, sha256: string, id?: string): Promise<SourceDocument | null> {
  if (!/^[a-f0-9]{64}$/.test(sha256)) return null;
  const [result] = await tx.select({ document: sourceDocuments }).from(sourceDocuments)
    .innerJoin(filings, eq(filings.id, sourceDocuments.filingId)).innerJoin(people, eq(people.id, canonicalPersonId(filings.personId)))
    .where(and(eq(sourceDocuments.sha256, sha256), id ? eq(sourceDocuments.id, id) : undefined, personIsEligible())).orderBy(sourceDocuments.id).limit(1);
  if (!result) return null;
  const history = await readEditorialCorrections(tx);
  const document = projectCorrections("source_document", sourceDocumentFromRow(result.document), history);
  const summaries = await readFinancialSummaries(tx, [document.filingId], history);
  const copies = await tx.select().from(sourceDocuments).where(and(eq(sourceDocuments.filingId, document.filingId), eq(sourceDocuments.sha256, sha256)));
  return withTranscriptionLevels(copies.map(row => row.id === document.id ? document : sourceDocumentFromRow(row)), summaries).find(row => row.id === document.id)!;
}

export function verifiedDocumentBytes(document: ReviewedFiling["document"], bytes: Uint8Array) {
  const body = Uint8Array.from(bytes);
  if (body.byteLength !== document.byteSize || createHash("sha256").update(body).digest("hex") !== document.sha256) throw new Error("Source Document byte size or checksum does not match its manifest");
  const signature = Buffer.from(body.subarray(0, 8));
  const signatureMatches = document.mediaType === "application/pdf" ? signature.subarray(0, 5).toString("ascii") === "%PDF-" :
    document.mediaType === "image/png" ? signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) :
      signature.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
  if (!signatureMatches) throw new Error("Source Document media type does not match its file signature");
  return body;
}

/** Read-only comparison also permits another original page for the same immutable Filing. */
export async function inspectReviewedFiling(db: ArchiveWriter, manifest: ReviewedFiling, verifyOnly = false) {
  const { filing, document } = manifest;
  const [original] = await db.select({ payload: manifestApplications.canonicalPayload }).from(manifestApplications)
    .where(and(eq(manifestApplications.kind, 'filing'), sql`json_extract(${manifestApplications.canonicalPayload}, '$.payload.filing.id') = ${filing.id}`)).orderBy(sql`rowid`).limit(1);
  // Later Documents have their own review, while the original Filing review stays immutable.
  const review = original ? validateReviewedFiling(JSON.parse(original.payload).payload).review : manifest.review;
  const filingRow = { ...filing, ...review, reportingDate: filing.reportingDate.value, executionDate: filing.executionDate?.value ?? null, receiptDate: filing.receiptDate?.value ?? null };
  const documentRow = { ...document, storageKey: documentStorageKey(document.sha256), acquisitionDate: document.acquisitionDate.value, officialReleaseDate: document.officialReleaseDate?.value ?? null };
  const [savedFilings, savedDocuments] = await Promise.all([
    db.select().from(filings).where(eq(filings.id, filing.id)),
    db.select().from(sourceDocuments).where(eq(sourceDocuments.id, document.id)),
  ]);
  return {
    filingRows: missingRows(savedFilings, [filingRow], row => row.id, "Filing", verifyOnly),
    documentRows: missingRows(savedDocuments, [documentRow], row => row.id, "Source Document", verifyOnly),
  };
}

/** The caller owns the transaction, including its manifest application record. */
export async function writeReviewedFiling(tx: ArchiveWriter, manifest: ReviewedFiling, verifyOnly = false) {
  if (!verifyOnly) await requireEligiblePerson(tx, manifest.filing.personId);
  const { filingRows, documentRows } = await inspectReviewedFiling(tx, manifest, verifyOnly);
  if (filingRows.length) await tx.insert(filings).values(filingRows);
  if (documentRows.length) await tx.insert(sourceDocuments).values(documentRows);
}

/** A metadata failure can leave an unlisted object, never a broken public record. */
export async function importReviewedFiling(db: ArchiveDatabase, input: unknown, bytes: Uint8Array, storage: DocumentStorage) {
  const manifest = validateReviewedFiling(input);
  const body = verifiedDocumentBytes(manifest.document, bytes);
  await requireEligiblePerson(db, manifest.filing.personId);
  const { documentRows } = await inspectReviewedFiling(db, manifest);
  if (!documentRows.length) throw new Error("Source Document ID already exists; existing evidence cannot be overwritten");
  const stored = await storage.put(body, manifest.document.sha256, manifest.document.mediaType);
  if (stored.storageKey !== documentStorageKey(manifest.document.sha256)) throw new Error("Storage returned an unexpected Source Document key");
  await db.transaction(tx => writeReviewedFiling(tx, manifest));
  return { filingId: manifest.filing.id, sourceDocumentId: manifest.document.id, storageKey: stored.storageKey };
}
