import type { IdentityMatch } from "../archive/types";
import { citation, object, parsePartialDate, strings, text, validateReviewedPerson, type ReviewedPerson } from "./validation";

export interface LegacyPersonIdentity {
  person: ReviewedPerson["person"];
  identifiers: string[];
  slugs: string[];
  sourceUrl: string;
}

export interface ReviewedIdentities {
  review: ReviewedPerson["review"];
  legacyPeople: LegacyPersonIdentity[];
  matches: Omit<IdentityMatch, "reviewedAt">[];
  documents: { path: string; sourceDocumentId: string; sha256: string }[];
}

export function legacyPersonRecord(review: ReviewedPerson["review"], entry: LegacyPersonIdentity): ReviewedPerson {
  return { review, person: entry.person, offices: [], tenures: [], jurisdictions: [], jurisdictionRelationships: [], constituencies: [], electoralTerms: [] };
}

export function legacyDocumentPath(value: unknown): string {
  const path = text(value, "legacy document path");
  const decoded = decodeURIComponent(path);
  if (!path.startsWith("/saln/") || !path.endsWith(".pdf") || /[?#\\\x00-\x1f\x7f]/.test(decoded) || /%[0-9a-f]{2}/i.test(decoded) || decoded.slice(1).split("/").some(part => !part || part === "." || part === "..")) {
    throw new Error("Legacy document path must be an exact /saln/ PDF path without traversal");
  }
  if (new URL(path, "https://archive.invalid").pathname !== path) throw new Error("Legacy document path is not canonical");
  return path;
}

export function validateReviewedIdentities(value: unknown): ReviewedIdentities {
  const root = object(value, ["review", "legacyPeople", "matches", "documents"], "identities");
  const reviewRow = object(root.review, ["reviewedAt", "reviewedBy"], "review");
  const reviewedAt = text(reviewRow.reviewedAt, "review.reviewedAt");
  if (parsePartialDate(reviewedAt)?.precision !== "day") throw new Error("review.reviewedAt must be a calendar date");
  const review = { reviewedAt, reviewedBy: text(reviewRow.reviewedBy, "review.reviewedBy") };
  function rows<T>(value: unknown, parse: (value: unknown) => T, key: (value: T) => string): T[] {
    if (!Array.isArray(value)) throw new Error("Identity records must be arrays");
    const result = value.map(parse);
    if (new Set(result.map(key)).size !== result.length) throw new Error("Identity records contain duplicate keys");
    return result;
  }
  const legacyPeople = rows(root.legacyPeople, value => {
    const entry = object(value, ["person", "identifiers", "slugs", "sourceUrl"], "legacy Person");
    const person = validateReviewedPerson({ review, person: entry.person, offices: [], tenures: [], jurisdictions: [], jurisdictionRelationships: [], constituencies: [], electoralTerms: [] }).person;
    const slugs = strings(entry.slugs, "legacy slugs");
    if (slugs.some(slug => !/^[a-z0-9][a-z0-9._-]*$/.test(slug))) throw new Error("Legacy slug must be URL-safe");
    const sourceUrl = text(entry.sourceUrl, "legacy source URL");
    const source = new URL(sourceUrl);
    if (!["http:", "https:"].includes(source.protocol) || source.username || source.password) throw new Error("Legacy source must be a public HTTP URL");
    return { person, identifiers: strings(entry.identifiers, "legacy identifiers"), slugs, sourceUrl };
  }, entry => entry.person.id);
  const matches = rows(root.matches, value => {
    const row = object(value, ["id", "fromPersonId", "toPersonId", "reason", "citations"], "Identity Match");
    if (!Array.isArray(row.citations) || !row.citations.length) throw new Error("Identity Match requires attributable evidence");
    const citations = row.citations.map((item, i) => citation(item, `identity citations[${i}]`, ["person", "office", "identity"]));
    if (!citations.some(source => source.supports.includes("identity"))) throw new Error("Identity Match requires explicit identity evidence");
    if (new Set(citations.map(source => source.id)).size !== citations.length) throw new Error("Identity Match has duplicate citations");
    const fromPersonId = text(row.fromPersonId, "fromPersonId"), toPersonId = text(row.toPersonId, "toPersonId");
    if (fromPersonId === toPersonId) throw new Error("Identity Match cannot redirect a Person to itself");
    return { id: text(row.id, "match.id"), fromPersonId, toPersonId, reason: text(row.reason, "match.reason"), citations };
  }, row => row.id);
  if (new Set(matches.map(row => row.fromPersonId)).size !== matches.length) throw new Error("A Person cannot have two merge targets");
  const documents = rows(root.documents, value => {
    const row = object(value, ["path", "sourceDocumentId", "sha256"], "legacy document");
    const sha256 = text(row.sha256, "legacy checksum");
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("Legacy document requires a SHA-256 checksum");
    return { path: legacyDocumentPath(row.path), sourceDocumentId: text(row.sourceDocumentId, "legacy Source Document ID"), sha256 };
  }, row => row.path);
  if (!legacyPeople.length && !matches.length && !documents.length) throw new Error("Identity manifest is empty");
  return { review, legacyPeople, matches, documents };
}
