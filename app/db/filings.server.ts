import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { SourceDocument } from "../archive/types";
import { documentStorageKey, type DocumentStorage } from "../storage/objects.server";
import type { ArchiveDatabase } from "./client.server";
import { personIsEligible } from "./eligibility";
import { validateReviewedFiling } from "./filing-validation";
import { filings, people, sourceDocuments } from "./schema";
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

/** Store verified bytes first. A database failure can leave an unlisted object, never a broken public record. */
export async function importReviewedFiling(db: ArchiveDatabase, input: unknown, bytes: Uint8Array, storage: DocumentStorage) {
  const manifest = validateReviewedFiling(input);
  const { filing, document } = manifest;
  const body = Uint8Array.from(bytes);
  if (body.byteLength !== document.byteSize || createHash("sha256").update(body).digest("hex") !== document.sha256) throw new Error("Source Document byte size or checksum does not match its manifest");
  const signature = Buffer.from(body.subarray(0, 8));
  const signatureMatches = document.mediaType === "application/pdf" ? signature.subarray(0, 5).toString("ascii") === "%PDF-" :
    document.mediaType === "image/png" ? signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) :
      signature.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
  if (!signatureMatches) throw new Error("Source Document media type does not match its file signature");
  const [person] = await db.select({ id: people.id }).from(people).where(and(eq(people.id, filing.personId), personIsEligible())).limit(1);
  if (!person) throw new Error("A Filing requires an Archive-Eligible Person");
  const [existingFiling, existingDocument] = await Promise.all([
    db.select({ id: filings.id }).from(filings).where(eq(filings.id, filing.id)).limit(1),
    db.select({ id: sourceDocuments.id }).from(sourceDocuments).where(eq(sourceDocuments.id, document.id)).limit(1),
  ]);
  if (existingFiling.length || existingDocument.length) throw new Error("Filing or Source Document ID already exists; existing evidence cannot be overwritten");
  const stored = await storage.put(body, document.sha256, document.mediaType);
  if (stored.storageKey !== documentStorageKey(document.sha256)) throw new Error("Storage returned an unexpected Source Document key");
  await db.transaction(async tx => {
    const [eligible] = await tx.select({ id: people.id }).from(people).where(and(eq(people.id, filing.personId), personIsEligible())).limit(1);
    if (!eligible) throw new Error("Person eligibility changed before publication");
    await tx.insert(filings).values({ ...filing, ...manifest.review, reportingDate: filing.reportingDate.value, executionDate: filing.executionDate?.value ?? null, receiptDate: filing.receiptDate?.value ?? null });
    await tx.insert(sourceDocuments).values({ ...document, storageKey: stored.storageKey, acquisitionDate: document.acquisitionDate.value, officialReleaseDate: document.officialReleaseDate?.value ?? null });
  });
  return { filingId: filing.id, sourceDocumentId: document.id, storageKey: stored.storageKey };
}
