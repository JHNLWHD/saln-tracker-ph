import { Link } from 'react-router';
import type { DirectoryResult } from '../archive/types';
import { FinancialTotals } from './FinancialTotals';

export function PersonCard({ person }: { person: Omit<DirectoryResult['rows'][number], 'id'> }) {
  return <article aria-label={person.canonicalName} className="card flex h-full flex-col rounded-xl border border-gray-200 bg-white shadow-sm">
    <div className="card-body flex flex-1 flex-col gap-5 p-5 sm:p-6">
      <header>
        <h3 className="card-title text-lg"><Link to={`/official/${person.slug}?view=reviewed`} className="text-primary-700">{person.canonicalName}</Link></h3>
        <p className="archive-muted mt-1 text-sm">{person.offices.join(' · ')}</p>
      </header>
      {person.latestSummary ? <div className="space-y-3">
        <FinancialTotals summary={person.latestSummary} />
        <p className="stat-desc archive-muted text-sm">Latest declared totals · Reporting Date: <time className="whitespace-nowrap" dateTime={person.summaryReportingDate?.value}>{person.summaryReportingDate?.value}</time> ({person.summaryReportingDate?.precision} precision)</p>
      </div> : <div className="space-y-2 py-2">
        <p className="archive-label">Declared net worth</p>
        <p className="text-lg font-semibold">{(person.summaryCount ?? 0) > 1 ? 'Multiple SALN entries' : 'Totals not transcribed'}</p>
        <p className="archive-muted text-sm">{person.documentCount === 0 ? 'No SALN documents available' : (person.summaryCount ?? 0) > 1 ? 'Inspect the separate Filings for their totals.' : 'Open the acquired Source Documents to read the declared information.'}</p>
      </div>}
      <div className="card-actions mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-4 text-sm">
        <span className="archive-muted">{person.documentCount} Source {person.documentCount === 1 ? 'Document' : 'Documents'}</span>
        <Link className="inline-flex min-h-11 items-center font-semibold text-primary-700" to={`/official/${person.slug}?view=reviewed`}>View Filings <span aria-hidden="true" className="ml-2">→</span><span className="sr-only"> for {person.canonicalName}</span></Link>
      </div>
    </div>
  </article>;
}
