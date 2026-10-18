import type { DeclaredFinancialSummary, FinancialSummarySources, SourceDocument } from '../archive/types';
import { formatAmount } from '../archive/financial';

export const summaryLabels = { totalAssets: 'Total assets', totalLiabilities: 'Total liabilities', declaredNetWorth: 'Declared net worth' };

export function FinancialTotals({ summary }: { summary: Record<keyof typeof summaryLabels, string | null> }) {
  return <dl className="stats grid grid-cols-1 gap-x-5 gap-y-4 tabular-nums sm:grid-cols-2">
    <div className="stat sm:col-span-2">
      <dt className="stat-title archive-label">Declared net worth</dt>
      <dd className="stat-value mt-1 break-all text-2xl font-bold leading-tight tracking-tight text-primary-700 sm:text-[2rem]">{summary.declaredNetWorth === null ? 'Not recorded' : formatAmount(summary.declaredNetWorth)}</dd>
    </div>
    {(['totalAssets', 'totalLiabilities'] as const).map(field => <div className="stat min-w-0" key={field}>
      <dt className="stat-title archive-muted text-sm">{summaryLabels[field]}</dt>
      <dd className="stat-value break-all text-base font-semibold">{summary[field] === null ? 'Not recorded' : formatAmount(summary[field])}</dd>
    </div>)}
  </dl>;
}

export function SummarySourceLinks({ sources, documents }: { sources: FinancialSummarySources; documents: SourceDocument[] }) {
  return <ul className="space-y-2">{Object.entries(sources).map(([field, source]) => {
    const document = documents.find(document => document.id === source.sourceDocumentId);
    return <li key={field}>{summaryLabels[field as keyof typeof summaryLabels]}: {document ? <a className="underline text-primary-700" href={`/documents/${document.sha256}`}>{source.location}</a> : <span>Referenced Source Document is unavailable</span>}</li>;
  })}</ul>;
}

export function FinancialSummary({ summary, documents }: { summary: DeclaredFinancialSummary; documents: SourceDocument[] }) {
  return <div className="space-y-4">
    <FinancialTotals summary={summary} />
    <details className="text-sm"><summary className="cursor-pointer py-2 text-primary-700 underline">View source references</summary>
      <div className="mt-2 space-y-3"><p className="archive-muted">Reviewed Transcription · {summary.reviewedAt}. The acquired Source Documents are authoritative.</p><SummarySourceLinks sources={summary.sources} documents={documents} /></div>
    </details>
  </div>;
}
