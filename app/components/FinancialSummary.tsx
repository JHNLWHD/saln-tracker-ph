import type { DeclaredFinancialSummary, FinancialSummarySources, SourceDocument } from '../archive/types';
import { formatAmount } from '../archive/financial';

export const summaryLabels = { totalAssets: 'Total assets', totalLiabilities: 'Total liabilities', declaredNetWorth: 'Declared net worth' };

export function SummarySourceLinks({ sources, documents }: { sources: FinancialSummarySources; documents: SourceDocument[] }) {
  return <ul className="space-y-2">{Object.entries(sources).map(([field, source]) => {
    const document = documents.find(document => document.id === source.sourceDocumentId);
    return <li key={field}>{summaryLabels[field as keyof typeof summaryLabels]}: {document ? <a className="underline text-primary-700" href={`/documents/${document.sha256}`}>{source.location}</a> : <span>Referenced Source Document is unavailable</span>}</li>;
  })}</ul>;
}

export function FinancialSummary({ summary, documents }: { summary: DeclaredFinancialSummary; documents: SourceDocument[] }) {
  return <div className="space-y-3 border-l-2 border-gray-300 pl-4">
    <h4>Declared Financial Summary</h4>
    <p className="archive-muted text-sm">Reviewed Transcription · {summary.reviewedAt}. The acquired Source Documents are authoritative.</p>
    <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[10rem_1fr]">{(Object.keys(summaryLabels) as (keyof typeof summaryLabels)[]).map(field => <div key={field} className="contents"><dt>{summaryLabels[field]}</dt><dd className="font-semibold tabular-nums">{formatAmount(summary[field])}</dd></div>)}</dl>
    <SummarySourceLinks sources={summary.sources} documents={documents} />
  </div>;
}
