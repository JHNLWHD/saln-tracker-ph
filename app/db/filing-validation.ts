import type { Filing, SourceDocument } from "../archive/types";
import { choice, date, object, parsePartialDate, text } from "./validation";

export interface ReviewedFiling {
  review: { reviewedAt: string; reviewedBy: string };
  filing: Filing;
  document: Omit<SourceDocument, "storageKey">;
}

export function validateReviewedFiling(value: unknown): ReviewedFiling {
  const input = object(value, ["review", "filing", "document"], "manifest");
  const review = object(input.review, ["reviewedAt", "reviewedBy"], "review");
  const reviewedAt = text(review.reviewedAt, "review.reviewedAt");
  if (parsePartialDate(reviewedAt)?.precision !== "day") throw new Error("review.reviewedAt must be a calendar date");
  const filing = object(input.filing, ["id", "personId", "filerName", "reportingDate", "executionDate", "receiptDate", "supersedesFilingId"], "filing");
  const reportingDate = date(filing.reportingDate, "filing.reportingDate");
  if (!reportingDate) throw new Error("A Filing must have an established Reporting Date");
  if (filing.supersedesFilingId !== null) throw new Error("Supersession requires an evidence workflow and cannot be inferred during import");
  const document = object(input.document, ["id", "filingId", "fileName", "mediaType", "byteSize", "sha256", "originalUrl", "provenanceType", "provenanceNote", "officialReleaseDate", "acquisitionDate", "archivePublicationDate", "transcriptionLevel"], "document");
  const filingId = text(filing.id, "filing.id");
  if (document.filingId !== filingId) throw new Error("Source Document must refer to this Filing");
  const fileName = text(document.fileName, "document.fileName");
  if (/[\x00-\x1f\x7f/\\]/.test(fileName) || [".", ".."].includes(fileName)) throw new Error("Source Document fileName must be a plain filename");
  const sha256 = text(document.sha256, "document.sha256");
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("Source Document needs a lowercase SHA-256 checksum");
  if (typeof document.byteSize !== "number" || !Number.isSafeInteger(document.byteSize) || document.byteSize <= 0) throw new Error("Source Document byteSize must be a positive safe integer");
  const provenanceType = choice(document.provenanceType, ["official_download", "formal_release", "preserved_copy"], "document.provenanceType");
  const originalUrl = document.originalUrl === null ? null : text(document.originalUrl, "document.originalUrl");
  if (originalUrl) {
    const url = new URL(originalUrl);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("Source Document originalUrl must be a public HTTP URL without credentials");
  }
  if (originalUrl === null && provenanceType !== "formal_release") throw new Error("An official download or preserved copy needs its origin URL");
  const acquisitionDate = date(document.acquisitionDate, "document.acquisitionDate");
  if (!acquisitionDate) throw new Error("Source Document Acquisition Date must be established");
  const archivePublicationDate = text(document.archivePublicationDate, "document.archivePublicationDate");
  const published = new Date(archivePublicationDate);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(archivePublicationDate) || !Number.isFinite(published.getTime()) || published.toISOString() !== archivePublicationDate) throw new Error("Archive Publication Date must be an exact UTC ISO timestamp");
  parsePartialDate(archivePublicationDate.slice(0, 10));
  if (reviewedAt > archivePublicationDate.slice(0, 10)) throw new Error("A Source Document must be reviewed before publication");
  if (acquisitionDate.value > archivePublicationDate.slice(0, acquisitionDate.value.length)) throw new Error("A Source Document cannot be published before its Acquisition Date");
  if (acquisitionDate.value > reviewedAt.slice(0, acquisitionDate.value.length)) throw new Error('A Source Document cannot be reviewed before its Acquisition Date');
  return {
    review: { reviewedAt, reviewedBy: text(review.reviewedBy, "review.reviewedBy") },
    filing: {
      id: filingId, personId: text(filing.personId, "filing.personId"), filerName: text(filing.filerName, "filing.filerName"), reportingDate,
      executionDate: date(filing.executionDate, "filing.executionDate"), receiptDate: date(filing.receiptDate, "filing.receiptDate"), supersedesFilingId: null,
    },
    document: {
      id: text(document.id, "document.id"), filingId, fileName,
      mediaType: choice(document.mediaType, ["application/pdf", "image/jpeg", "image/png"], "document.mediaType"),
      byteSize: document.byteSize, sha256, originalUrl, provenanceType,
      provenanceNote: text(document.provenanceNote, "document.provenanceNote"),
      officialReleaseDate: date(document.officialReleaseDate, "document.officialReleaseDate"), acquisitionDate, archivePublicationDate,
      transcriptionLevel: choice(document.transcriptionLevel, ["document_only"], "document.transcriptionLevel"),
    },
  };
}
