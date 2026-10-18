import type { DeclaredFinancialSummary, FinancialSummarySources, SourceDocument } from '../archive/types';
import { FinancialTotals, summaryLabels } from './FinancialTotals';

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
