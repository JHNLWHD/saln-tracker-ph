import { Link } from 'react-router';
import type { LegacyData, LegacyProfile, LegacyRecord } from '../db/legacy.server';
import { FinancialTotals } from './FinancialTotals';
import { formatAmount } from '../archive/financial';
import { ArchiveTable, EmptyState, TextField } from './ui/Archive';
import { Button } from './ui/Button';

const legacyLabel = 'Original tracker data';
const amount = (value: number | null) => value === null ? 'Not recorded' : formatAmount(value.toFixed(2));

function LegacyTotals({ record }: { record: LegacyRecord }) {
  return <FinancialTotals summary={{ totalAssets: record.total_assets?.toFixed(2) ?? null, totalLiabilities: record.total_liabilities?.toFixed(2) ?? null, declaredNetWorth: record.net_worth?.toFixed(2) ?? null }} />;
}
function LegacyLabel() {
  return <p className="text-sm font-semibold text-gray-600">{legacyLabel}</p>;
}
function sourceHref(value: string) {
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return undefined;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? value : undefined; }
  catch { return undefined; }
}

export function LegacyDirectory({ data, query = '', directoryPath }: { data: LegacyData; query?: string; directoryPath?: '/people' }) {
  const count = data.profiles.reduce((total, profile) => total + profile.saln_records.length, 0);
  return <div className="space-y-8">
    <header className="space-y-3">
      <p className="archive-label">SALN Tracker PH</p><h1>Explore declared assets and net worth</h1>
      <LegacyLabel /><p className="archive-muted max-w-3xl">Profiles and SALN entries from the earlier tracker. Amounts, office details, dates and source links are shown as recorded.</p>
      <p className="text-lg font-semibold" role="status">{data.profiles.length} profiles · {count} SALN entries{query && ' matching your search'}</p>
      <Link className="inline-flex min-h-11 items-center text-primary-700 underline" to={`${directoryPath ?? '/'}?view=reviewed`}>Browse the reviewed Archive</Link>
    </header>
    {directoryPath && <form key={query} method="get" action={directoryPath} className="flex flex-wrap items-end gap-3" aria-label="Search legacy records">
      <div className="w-full sm:min-w-0 sm:flex-1"><TextField id="legacy-query" name="q" label="Name, position or agency" type="search" maxLength={128} defaultValue={query} /></div>
      <Button type="submit">Find People</Button>{query && <Link to="/people" className="inline-flex min-h-11 items-center underline">Clear search</Link>}
    </form>}
    {data.profiles.length ? <section aria-label="Legacy profiles" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.profiles.map(profile => {
      const latestYear = Math.max(...profile.saln_records.map(record => record.year));
      const latest = profile.saln_records.filter(record => record.year === latestYear);
      const href = `/official/${encodeURIComponent(profile.id)}`;
      return <article key={profile.id} aria-label={profile.name} className="card flex h-full flex-col rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="card-body flex flex-1 flex-col gap-5 p-5 sm:p-6">
          <header><h2 className="card-title text-lg"><Link to={href} className="text-primary-700">{profile.name}</Link></h2><p className="archive-muted mt-1 text-sm">{[profile.position, profile.agency].filter(Boolean).join(' · ')}</p></header>
          {latest.length ? latest.map((record, index) => <div key={index} className="space-y-3"><p className="archive-label">{record.year}{latest.length > 1 && ` · Entry ${index + 1}`}</p><LegacyTotals record={record} /></div>) : <p>No SALN entries recorded.</p>}
          <div className="card-actions mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-4 text-sm"><span>{profile.saln_records.length} SALN {profile.saln_records.length === 1 ? 'entry' : 'entries'}</span><Link to={href} className="inline-flex min-h-11 items-center font-semibold text-primary-700">View all entries<span className="sr-only"> for {profile.name}</span><span aria-hidden="true" className="ml-2">→</span></Link></div>
        </div>
      </article>;
    })}</section> : <EmptyState title="No matching profiles"><p>Try another name, position or agency.</p></EmptyState>}
    <p className="archive-muted text-sm">Legacy data copied on <time dateTime={data.capturedAt}>{data.capturedAt.slice(0, 10)}</time>.</p>
  </div>;
}

export function LegacyPersonProfile({ profile, reviewedSlug }: { profile: LegacyProfile; reviewedSlug: string | null }) {
  const records = profile.saln_records.map((record, index) => ({ record, index })).sort((a, b) => b.record.year - a.record.year);
  return <div className="space-y-8">
    <header className="space-y-3"><Link to="/" className="inline-flex min-h-11 items-center underline text-primary-700">All profiles</Link><h1>{profile.name}</h1><p>{[profile.position, profile.agency].filter(Boolean).join(' · ')}</p><LegacyLabel /><p className="archive-muted">Amounts, items, office details, dates and source links are preserved from the earlier tracker.</p>
      <p>{records.length} SALN {records.length === 1 ? 'entry' : 'entries'}</p>
      {reviewedSlug && <Link className="inline-flex min-h-11 items-center underline text-primary-700" to={`/official/${encodeURIComponent(reviewedSlug)}?view=reviewed`}>View this Person in the reviewed Archive</Link>}
      <details className="text-sm"><summary className="cursor-pointer py-2 underline">Legacy office details</summary><dl className="mt-2 grid gap-2 sm:grid-cols-3">{[['Legacy status', profile.status], ['Legacy term start', profile.term_start], ['Legacy term end', profile.term_end]].map(([label, value]) => <div key={label}><dt className="archive-muted">{label}</dt><dd>{value || 'Not recorded'}</dd></div>)}</dl></details>
    </header>
    {records.map(({ record, index }) => <section id={`legacy-entry-${index + 1}`} key={index} aria-labelledby={`legacy-year-${index}`} className="card space-y-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <header><h2 id={`legacy-year-${index}`}>{record.year} SALN entry</h2></header>
      <LegacyTotals record={record} />
      <p className="archive-muted text-sm">Legacy filing date: {record.date_filed || 'Not recorded'} · Legacy status: {record.status || 'Not recorded'}</p>
      {record.source_url ? <div className="space-y-1">{sourceHref(record.source_url) ? <a className="inline-flex min-h-11 items-center break-all font-semibold text-primary-700 underline" href={sourceHref(record.source_url)} rel="noreferrer">Open legacy source</a> : <p>Legacy source reference</p>}<p className="archive-muted text-sm">{record.source_description || 'No source description recorded'}</p><p className="break-all text-xs">{record.source_url}</p></div> : <p className="archive-muted">No source link recorded.</p>}
      <details><summary className="cursor-pointer py-2 font-semibold text-primary-700 underline">Recorded items · {record.assets.length} assets · {record.liabilities.length} liabilities</summary>
        <div className="mt-3 space-y-5">
          {record.assets.length ? <ArchiveTable caption="Legacy assets"><thead><tr><th scope="col">Description</th><th scope="col">Value</th><th scope="col">Legacy source note</th></tr></thead><tbody>{record.assets.map((item, index) => <tr key={index}><td>{item.description || 'Not recorded'}</td><td className="tabular-nums">{amount(item.value)}</td><td>{item.source || 'Not recorded'}</td></tr>)}</tbody></ArchiveTable> : <p>No asset items recorded.</p>}
          {record.liabilities.length ? <ArchiveTable caption="Legacy liabilities"><thead><tr><th scope="col">Creditor</th><th scope="col">Nature</th><th scope="col">Balance</th></tr></thead><tbody>{record.liabilities.map((item, index) => <tr key={index}><td>{item.creditor || 'Not recorded'}</td><td>{item.nature || 'Not recorded'}</td><td className="tabular-nums">{amount(item.balance)}</td></tr>)}</tbody></ArchiveTable> : <p>No liability items recorded.</p>}
        </div>
      </details>
    </section>)}
  </div>;
}
