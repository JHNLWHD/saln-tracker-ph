import { eq, inArray } from "drizzle-orm";
import type { DeclaredFinancialSummary, EditorialCorrection, SecondaryReport, SourceDocument } from "../archive/types";
import { missingRows } from "./canonical";
import type { ArchiveReader, ArchiveWriter } from "./client.server";
import { projectCorrections, readEditorialCorrections } from "./corrections.server";
import { requireEligiblePerson } from "./eligibility";
import * as schema from "./schema";
import { parsePartialDate } from "./validation";
import { checkSummarySources, type ReviewedReport, type ReviewedSummary } from "./transcription-validation";

export async function writeReviewedSummary(tx: ArchiveWriter, record: ReviewedSummary, verifyOnly = false) {
  const [filing] = await tx.select({ personId: schema.filings.personId }).from(schema.filings).where(eq(schema.filings.id, record.summary.filingId));
  if (!filing) throw new Error("A summary needs an acquired Filing");
  if (!verifyOnly) await requireEligiblePerson(tx, filing.personId);
  await checkSummarySources(tx, record.summary);
  const rows = missingRows(await tx.select().from(schema.financialSummaries).where(eq(schema.financialSummaries.id, record.summary.id)), [{ ...record.summary, ...record.review }], row => row.id, "Declared Financial Summary", verifyOnly);
  if (rows.length) await tx.insert(schema.financialSummaries).values(rows);
}

export async function writeReviewedReport(tx: ArchiveWriter, record: ReviewedReport, verifyOnly = false) {
  if (!verifyOnly) await requireEligiblePerson(tx, record.report.personId);
  const rows = missingRows(await tx.select().from(schema.secondaryReports).where(eq(schema.secondaryReports.id, record.report.id)), [{ ...record.report, publishedDate: record.report.publishedDate?.value ?? null, ...record.review }], row => row.id, "Secondary Report", verifyOnly);
  if (rows.length) await tx.insert(schema.secondaryReports).values(rows);
}

export async function readFinancialSummaries(tx: ArchiveReader, filingIds: string[], history?: EditorialCorrection[]): Promise<DeclaredFinancialSummary[]> {
  const rows = await tx.select({ id: schema.financialSummaries.id, filingId: schema.financialSummaries.filingId, sources: schema.financialSummaries.sources,
    totalAssets: schema.financialSummaries.totalAssets, totalLiabilities: schema.financialSummaries.totalLiabilities, declaredNetWorth: schema.financialSummaries.declaredNetWorth, currency: schema.financialSummaries.currency, reviewedAt: schema.financialSummaries.reviewedAt,
  }).from(schema.financialSummaries).where(inArray(schema.financialSummaries.filingId, filingIds)).orderBy(schema.financialSummaries.id);
  const corrections = history ?? await readEditorialCorrections(tx);
  const summaries = rows.map(row => projectCorrections("financial_summary", row, corrections));
  // ponytail: one source check per summary for the first roster; batch IDs when histories grow.
  for (const summary of summaries) await checkSummarySources(tx, summary);
  return summaries;
}

export async function readSecondaryReports(tx: ArchiveReader, personIds: string[], history?: EditorialCorrection[]): Promise<SecondaryReport[]> {
  const rows = await tx.select({ id: schema.secondaryReports.id, personId: schema.secondaryReports.personId, title: schema.secondaryReports.title, url: schema.secondaryReports.url,
    publisher: schema.secondaryReports.publisher, publishedDate: schema.secondaryReports.publishedDate, note: schema.secondaryReports.note, reviewedAt: schema.secondaryReports.reviewedAt,
  }).from(schema.secondaryReports).where(inArray(schema.secondaryReports.personId, personIds)).orderBy(schema.secondaryReports.id);
  const corrections = history ?? await readEditorialCorrections(tx);
  return rows.map(row => projectCorrections("secondary_report", { ...row, publishedDate: parsePartialDate(row.publishedDate) }, corrections));
}

/** Extraction progress changes the public projection; the acquired metadata stays immutable. */
export function withTranscriptionLevels<T extends Pick<SourceDocument, "id" | "sha256" | "transcriptionLevel">>(documents: T[], summaries: DeclaredFinancialSummary[]): T[] {
  const sourceIds = new Set(summaries.flatMap(summary => Object.values(summary.sources).map(source => source.sourceDocumentId)));
  const checksums = new Set(documents.filter(document => sourceIds.has(document.id)).map(document => document.sha256));
  return documents.map(document => ({ ...document, transcriptionLevel: document.transcriptionLevel === "document_only" && checksums.has(document.sha256) ? "summary_totals" : document.transcriptionLevel }));
}
