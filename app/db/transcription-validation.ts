import type { DeclaredFinancialSummary, FinancialSummarySources, SecondaryReport } from "../archive/types";
import { choice, date, object, parsePartialDate, text } from "./validation";
import { inArray } from "drizzle-orm";
import type { ArchiveReader } from "./client.server";
import { sourceDocuments } from "./schema";

export const summaryFields = ["totalAssets", "totalLiabilities", "declaredNetWorth"] as const;

export function amount(value: unknown, path: string): string {
  const result = text(value, path);
  if (result.length > 128 || !/^-?(0|[1-9]\d*)\.\d{2}$/.test(result) || result === "-0.00") throw new Error(`${path} must be an exact decimal string with two decimal places`);
  return result;
}

export function summarySources(value: unknown): FinancialSummarySources {
  const sources = object(value, [...summaryFields], "sources");
  return Object.fromEntries(summaryFields.map(field => {
    const source = object(sources[field], ["sourceDocumentId", "location"], `sources.${field}`);
    return [field, { sourceDocumentId: text(source.sourceDocumentId, `${field}.sourceDocumentId`), location: text(source.location, `${field}.location`) }];
  })) as FinancialSummarySources;
}

export function publicUrl(value: unknown, path: string): string {
  const result = text(value, path), url = new URL(result);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error(`${path} must be a public HTTP URL`);
  return result;
}

function review(value: unknown) {
  const row = object(value, ["reviewedAt", "reviewedBy"], "review");
  const reviewedAt = text(row.reviewedAt, "review.reviewedAt");
  if (parsePartialDate(reviewedAt)?.precision !== "day") throw new Error("review.reviewedAt must be a calendar date");
  return { reviewedAt, reviewedBy: text(row.reviewedBy, "review.reviewedBy") };
}

export interface ReviewedSummary { review: ReturnType<typeof review>; summary: Omit<DeclaredFinancialSummary, "reviewedAt"> }
export interface ReviewedReport { review: ReturnType<typeof review>; report: Omit<SecondaryReport, "reviewedAt"> }

export async function checkSummarySources(tx: ArchiveReader, summary: ReviewedSummary["summary"]) {
  const ids = [...new Set(Object.values(summary.sources).map(source => source.sourceDocumentId))];
  const documents = await tx.select({ id: sourceDocuments.id, filingId: sourceDocuments.filingId }).from(sourceDocuments).where(inArray(sourceDocuments.id, ids));
  if (documents.length !== ids.length || documents.some(document => document.filingId !== summary.filingId)) throw new Error("Every summary value needs an acquired Source Document from its own Filing");
}

export function validateSummary(value: unknown): ReviewedSummary["summary"] {
  const row = object(value, ["id", "filingId", "sources", ...summaryFields, "currency"], "summary");
  return { id: text(row.id, "summary.id"), filingId: text(row.filingId, "summary.filingId"), sources: summarySources(row.sources), totalAssets: amount(row.totalAssets, "summary.totalAssets"), totalLiabilities: amount(row.totalLiabilities, "summary.totalLiabilities"), declaredNetWorth: amount(row.declaredNetWorth, "summary.declaredNetWorth"), currency: choice(row.currency, ["PHP"], "currency") };
}

export function validateReviewedSummary(value: unknown): ReviewedSummary {
  const row = object(value, ["review", "summary"], "transcription");
  return { review: review(row.review), summary: validateSummary(row.summary) };
}

export function validateReport(value: unknown): ReviewedReport["report"] {
  const row = object(value, ["id", "personId", "title", "url", "publisher", "publishedDate", "note"], "report");
  return { id: text(row.id, "report.id"), personId: text(row.personId, "report.personId"), title: text(row.title, "report.title"), url: publicUrl(row.url, "report.url"), publisher: text(row.publisher, "report.publisher"), publishedDate: date(row.publishedDate, "publishedDate"), note: text(row.note, "report.note") };
}

export function validateReviewedReport(value: unknown): ReviewedReport {
  const row = object(value, ["review", "report"], "related reporting"), checkedReview = review(row.review), report = validateReport(row.report);
  if (report.publishedDate && report.publishedDate.value > checkedReview.reviewedAt) throw new Error("Report publication follows its review");
  return { review: checkedReview, report };
}
