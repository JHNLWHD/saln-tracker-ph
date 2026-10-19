import { Link } from 'react-router';
import type { LegacyData, LegacyProfile, LegacyRecord } from '../db/legacy.server';
import { FinancialTotals } from './FinancialTotals';
import { formatAmount } from '../archive/financial';
import { ArchiveTable, EmptyState, TextField } from './ui/Archive';
import { Button } from './ui/Button';
import { CollapsibleSection } from './ui/CollapsibleSection';

const amount = (value: number | null) => value === null ? 'Not recorded' : formatAmount(value.toFixed(2));

function LegacyTotals({ record }: { record: LegacyRecord }) {
  return <FinancialTotals summary={{ totalAssets: record.total_assets?.toFixed(2) ?? null, totalLiabilities: record.total_liabilities?.toFixed(2) ?? null, declaredNetWorth: record.net_worth?.toFixed(2) ?? null }} />;
}
function sourceHref(value: string) {
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return undefined;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? value : undefined; }
  catch { return undefined; }
}

const agencyNames = new Map([['EXECUTIVE', 'Executive Branch'], ['LEGISLATIVE', 'Legislative Branch'], ['CONSTITUTIONAL_COMMISSION', 'Constitutional Commissions'], ['JUDICIARY', 'Judiciary']]);
const statusNames = new Map([['active', 'Current officials'], ['inactive', 'Former officials']]);
const positionRanks = new Map([['president', 0], ['vice president', 1], ['chairman', 0], ['chairperson', 0], ['ombudsman', 0], ['commissioner', 1]]);
function comparePositions(a: LegacyProfile, b: LegacyProfile) {
  const position = (profile: LegacyProfile) => (profile.position ?? '').replace(/^former\s+/i, '').trim().toLowerCase();
  const first = position(a), second = position(b);
  const rank = (value: string) => positionRanks.get(value.split(',')[0].trim()) ?? 2;
  return rank(first) - rank(second) || first.localeCompare(second, 'en-PH');
}

function LegacyCard({ profile }: { profile: LegacyProfile }) {
  const latestYear = Math.max(...profile.saln_records.map(record => record.year));
  const latest = profile.saln_records.filter(record => record.year === latestYear);
  const href = `/official/${encodeURIComponent(profile.id)}`;
  return <article aria-label={profile.name} className="card flex h-full flex-col rounded-xl border border-gray-200 bg-white shadow-sm">
    <div className="card-body flex flex-1 flex-col gap-5 p-5 sm:p-6">
      <header><h3 className="card-title text-lg"><Link to={href} className="text-primary-700">{profile.name}</Link></h3><p className="archive-muted mt-1 text-sm">{[profile.position, profile.agency].filter(Boolean).join(' · ')}</p></header>
      {latest.length ? latest.map((record, index) => <div key={index} className="space-y-3"><p className="archive-label">{record.year}{latest.length > 1 && ` · Entry ${index + 1}`}</p><LegacyTotals record={record} /></div>) : <p>No SALN entries recorded.</p>}
      <div className="card-actions mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-4 text-sm"><span>{profile.saln_records.length} SALN {profile.saln_records.length === 1 ? 'entry' : 'entries'}</span><Link to={href} className="inline-flex min-h-11 items-center font-semibold text-primary-700">View all entries<span className="sr-only"> for {profile.name}</span><span aria-hidden="true" className="ml-2">→</span></Link></div>
    </div>
  </article>;
}

export function LegacyDirectory({ data, query = '' }: { data: LegacyData; query?: string }) {
  const count = data.profiles.reduce((total, profile) => total + profile.saln_records.length, 0);
  const statuses = [...new Set([...statusNames.keys(), ...data.profiles.map(profile => profile.status ?? '')])];
  const agencies = [...new Set([...agencyNames.keys(), ...data.profiles.map(profile => profile.agency ?? '')])];
  return <div className="space-y-6">
    <header className="space-y-2">
      <p className="archive-label">SALN Tracker PH</p><h1>Explore declared assets and net worth</h1>
      <p className="archive-muted max-w-3xl text-sm">Browse public officials and open their SALN entries and sources.</p>
      <p className="text-lg font-semibold" role="status">{data.profiles.length} profiles · {count} SALN entries{query && ' matching your search'}</p>
    </header>
    <form key={query} method="get" action="/" className="flex flex-wrap items-end gap-3" aria-label="Search SALNs">
      <div className="w-full sm:min-w-0 sm:flex-1"><TextField id="legacy-query" name="q" label="Name, position or agency" type="search" maxLength={128} defaultValue={query} /></div>
      <Button type="submit">Search</Button>{query && <Link to="/" className="inline-flex min-h-11 items-center underline">Clear search</Link>}
    </form>
    {data.profiles.length ? <div aria-label="Officials" className="space-y-8">{statuses.map(status => {
      const profiles = data.profiles.filter(profile => (profile.status ?? '') === status);
      if (!profiles.length) return null;
      const title = statusNames.get(status) ?? (status ? `Recorded status: ${status}` : 'Status not recorded');
      return <section key={status} aria-label={title} className="space-y-4"><h2>{title}</h2>{agencies.map(agency => {
        const members = profiles.filter(profile => (profile.agency ?? '') === agency).sort((a, b) => comparePositions(a, b) || a.name.localeCompare(b.name, 'en-PH') || a.id.localeCompare(b.id));
        if (!members.length) return null;
        return <CollapsibleSection key={agency} title={agencyNames.get(agency) ?? (agency || 'Agency not recorded')} count={members.length} defaultExpanded={Boolean(query) || agency === 'EXECUTIVE' || agency === 'LEGISLATIVE'}>
          <div className={`grid gap-4 md:grid-cols-2 ${agency === 'EXECUTIVE' ? '' : 'xl:grid-cols-3'}`}>{members.map(profile => <LegacyCard key={profile.id} profile={profile} />)}</div>
        </CollapsibleSection>;
      })}</section>;
    })}</div> : <EmptyState title="No matching profiles"><p>Try another name, position or agency.</p></EmptyState>}
  </div>;
}

export function LegacyPersonProfile({ profile }: { profile: LegacyProfile }) {
  const records = profile.saln_records.map((record, index) => ({ record, index })).sort((a, b) => b.record.year - a.record.year);
  return <div className="space-y-8">
    <header className="space-y-3"><Link to="/" className="inline-flex min-h-11 items-center underline text-primary-700">All profiles</Link><h1>{profile.name}</h1><p>{[profile.position, profile.agency].filter(Boolean).join(' · ')}</p><p className="archive-muted">Explore declared totals and the sources for each SALN.</p>
      <p>{records.length} SALN {records.length === 1 ? 'entry' : 'entries'}</p>
      <details className="text-sm"><summary className="cursor-pointer py-2 underline">Office details</summary><dl className="mt-2 grid gap-2 sm:grid-cols-3">{[['Recorded status', profile.status], ['Term start', profile.term_start], ['Term end', profile.term_end]].map(([label, value]) => <div key={label}><dt className="archive-muted">{label}</dt><dd>{value || 'Not recorded'}</dd></div>)}</dl></details>
    </header>
    {records.map(({ record, index }) => <section id={`legacy-entry-${index + 1}`} key={index} aria-labelledby={`legacy-year-${index}`} className="card space-y-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <header><h2 id={`legacy-year-${index}`}>{record.year} SALN entry</h2></header>
      <LegacyTotals record={record} />
      <p className="archive-muted text-sm">Filing date: {record.date_filed || 'Not recorded'} · Recorded status: {record.status || 'Not recorded'}</p>
      {record.source_url ? <div className="space-y-1">{sourceHref(record.source_url) ? <a className="inline-flex min-h-11 items-center break-all font-semibold text-primary-700 underline" href={sourceHref(record.source_url)} rel="noreferrer">View source</a> : <p>Source reference</p>}<p className="archive-muted text-sm">{record.source_description || 'No source description recorded'}</p><p className="break-all text-xs">{record.source_url}</p></div> : <p className="archive-muted">No source link recorded.</p>}
      <details><summary className="cursor-pointer py-2 font-semibold text-primary-700 underline">Recorded items · {record.assets.length} assets · {record.liabilities.length} liabilities</summary>
        <div className="mt-3 space-y-5">
          {record.assets.length ? <ArchiveTable caption="Assets"><thead><tr><th scope="col">Description</th><th scope="col">Value</th><th scope="col">Source note</th></tr></thead><tbody>{record.assets.map((item, index) => <tr key={index}><td>{item.description || 'Not recorded'}</td><td className="tabular-nums">{amount(item.value)}</td><td>{item.source || 'Not recorded'}</td></tr>)}</tbody></ArchiveTable> : <p>No asset items recorded.</p>}
          {record.liabilities.length ? <ArchiveTable caption="Liabilities"><thead><tr><th scope="col">Creditor</th><th scope="col">Nature</th><th scope="col">Balance</th></tr></thead><tbody>{record.liabilities.map((item, index) => <tr key={index}><td>{item.creditor || 'Not recorded'}</td><td>{item.nature || 'Not recorded'}</td><td className="tabular-nums">{amount(item.balance)}</td></tr>)}</tbody></ArchiveTable> : <p>No liability items recorded.</p>}
        </div>
      </details>
    </section>)}
  </div>;
}
