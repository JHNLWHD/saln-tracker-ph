import type { Citation, CorrectionChanges, CorrectionTargetType } from "../archive/types";
import { choice, citation, date, facts, object, parsePartialDate, strings, text } from "./validation";

const fields: Record<CorrectionTargetType, readonly string[]> = {
  person: ["canonicalName", "nameVariants"],
  tenure: ["startDate", "endDate", "assumptionMethod", "verificationStatus", "disputedFacts"],
  filing: ["filerName", "reportingDate", "executionDate", "receiptDate"],
  source_document: ["fileName", "originalUrl", "provenanceType", "provenanceNote", "officialReleaseDate", "acquisitionDate", "archivePublicationDate"],
};

export interface ReviewedCorrection {
  review: { reviewedAt: string; reviewedBy: string };
  reason: string;
  target: { type: CorrectionTargetType; id: string };
  previousCorrectionId: string | null;
  changes: CorrectionChanges;
  citations: Citation[];
}

export function validateReviewedCorrection(value: unknown): ReviewedCorrection {
  const input = object(value, ["review", "reason", "target", "previousCorrectionId", "changes", "citations"], "correction");
  const review = object(input.review, ["reviewedAt", "reviewedBy"], "review");
  const reviewedAt = text(review.reviewedAt, "review.reviewedAt");
  if (parsePartialDate(reviewedAt)?.precision !== "day") throw new Error("review.reviewedAt must be a calendar date");
  const target = object(input.target, ["type", "id"], "target");
  const type = choice(target.type, ["person", "tenure", "filing", "source_document"], "target.type");
  const patch = object(input.changes, [...fields[type]], "changes");
  if (!Object.keys(patch).length) throw new Error("An Editorial Correction needs at least one changed field");
  const changes: CorrectionChanges = {};
  for (const [key, value] of Object.entries(patch)) {
    const path = `changes.${key}`;
    switch (key) {
      case "canonicalName": case "filerName": case "fileName": case "provenanceNote":
        changes[key] = text(value, path); break;
      case "nameVariants": changes.nameVariants = strings(value, path); break;
      case "startDate": case "endDate": case "executionDate": case "receiptDate": case "officialReleaseDate":
        changes[key] = date(value, path); break;
      case "reportingDate": case "acquisitionDate": {
        const parsed = date(value, path);
        if (!parsed) throw new Error(`${path} cannot be unknown`);
        changes[key] = parsed; break;
      }
      case "assumptionMethod": changes.assumptionMethod = choice(value, ["election", "succession", "substitution", "vacancy_appointment", "chamber_selection", "unknown"] as const, path); break;
      case "verificationStatus": changes.verificationStatus = choice(value, ["verified", "unverified", "disputed"] as const, path); break;
      case "disputedFacts":
        changes.disputedFacts = strings(value, path);
        changes.disputedFacts.forEach(fact => choice(fact, facts, path)); break;
      case "provenanceType": changes.provenanceType = choice(value, ["official_download", "formal_release", "preserved_copy"] as const, path); break;
      case "originalUrl": {
        changes.originalUrl = value === null ? null : text(value, path);
        if (changes.originalUrl) {
          const url = new URL(changes.originalUrl);
          if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error(`${path} must be a public HTTP URL`);
        }
        break;
      }
      case "archivePublicationDate": {
        const timestamp = text(value, path);
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp) || !Number.isFinite(Date.parse(timestamp)) || new Date(timestamp).toISOString() !== timestamp) throw new Error(`${path} must be a UTC ISO timestamp`);
        parsePartialDate(timestamp.slice(0, 10));
        changes.archivePublicationDate = timestamp; break;
      }
    }
  }
  if (!Array.isArray(input.citations) || !input.citations.length) throw new Error("An Editorial Correction needs attributable citations");
  const citations = input.citations.map((source, i) => citation(source, `citations[${i}]`, [...fields[type], ...facts]));
  if (new Set(citations.map(source => source.id)).size !== citations.length) throw new Error("Correction citations contain duplicate IDs");
  for (const field of Object.keys(changes)) {
    if (["verificationStatus", "disputedFacts"].includes(field)) continue;
    if (!citations.some(source => source.supports.includes(field))) throw new Error(`${field} needs correction evidence`);
  }
  if (changes.verificationStatus && !citations.some(source => source.supports.includes("person") && source.supports.includes("office"))) throw new Error("A verification correction needs identity and Office evidence");
  for (const fact of changes.disputedFacts ?? []) {
    if (!citations.some(source => source.supports.includes(fact))) throw new Error(`${fact} needs dispute evidence`);
  }
  return {
    review: { reviewedAt, reviewedBy: text(review.reviewedBy, "review.reviewedBy") },
    reason: text(input.reason, "reason"), target: { type, id: text(target.id, "target.id") },
    previousCorrectionId: input.previousCorrectionId === null ? null : text(input.previousCorrectionId, "previousCorrectionId"),
    changes, citations,
  };
}
