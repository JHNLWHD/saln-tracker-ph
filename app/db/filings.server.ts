import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { SourceDocument } from "../archive/types";
import { documentStorageKey, type DocumentStorage } from "../storage/objects.server";
import type { ArchiveDatabase, ArchiveWriter } from "./client.server";
import { personIsEligible } from "./eligibility";
import { validateReviewedFiling, type ReviewedFiling } from "./filing-validation";
import { missingRows } from "./canonical";
import { filings, manifestApplications, people, sourceDocuments } from "./schema";
import { parsePartialDate } from "./validation";

export function sourceDocumentFromRow(row: typeof sourceDocuments.$inferSelect): SourceDocument {
  const acquisitionDate = parsePartialDate(row.acquisitionDate);
  if (!acquisitionDate) throw new Error("Stored Source Document has no Acquisition Date");
  return { ...row, acquisitionDate, officialReleaseDate: parsePartialDate(row.officialReleaseDate) };
}

export async function findPublicSourceDocument(db: ArchiveDatabase, sha256: string): Promise<SourceDocument | null> {
  if (!/^[a-f0-9]{64}$/.test(sha256)) return null;
  const [result] = await db.select({ document: sourceDocuments }).from(sourceDocuments)
    .innerJoin(filings, eq(filings.id, sourceDocuments.filingId)).innerJoin(people, eq(people.id, filings.personId))
    .where(and(eq(sourceDocuments.sha256, sha256), personIsEligible())).orderBy(sourceDocuments.id).limit(1);
  return result ? sourceDocumentFromRow(result.document) : null;
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

export async function requireEligiblePerson(db: ArchiveWriter, personId: string) {
  const [person] = await db.select({ id: people.id }).from(people).where(and(eq(people.id, personId), personIsEligible())).limit(1);
  if (!person) throw new Error("A Filing requires an Archive-Eligible Person");
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
