import { Link } from 'react-router';
import type { ArchiveHome as HomeData } from '../archive/types';
import { ArchiveTable, EmptyState, EvidenceRow } from './ui/Archive';

const scopeLabels = { executive: 'President and Vice President', senate: 'Senate', speaker: 'Speaker of the House', house: 'House of Representatives', local: 'Local elected offices' };

export function ArchiveHome({ data }: { data: HomeData }) {
  return <div className="space-y-10">
    <header className="border-b border-gray-300 pb-6 space-y-3">
      <p className="archive-label">SALN Archive</p>
      <h1>Find and inspect declared SALNs</h1>
      <p>Read acquired Source Documents and reviewed Transcriptions. Archive coverage does not establish compliance or verify real-world wealth.</p>
    </header>
    {data.rosters.length === 0 && <EmptyState title="No reviewed Roster Snapshot is available"><p>Officeholders will appear after their Tenures and roster membership are reviewed.</p></EmptyState>}
    {data.rosters.map(({ snapshot, rows }) => <section key={snapshot.id} aria-labelledby={`roster-${snapshot.scope}`} className="space-y-3">
      <h2 id={`roster-${snapshot.scope}`}>{scopeLabels[snapshot.scope]}</h2>
      <p className="text-sm">Roster Snapshot · Verified as of <time dateTime={snapshot.verifiedAsOf}>{snapshot.verifiedAsOf}</time>. Manually reviewed; this is not a live roster.</p>
      {rows.length < snapshot.members.length && <p className="archive-muted">Some roster entries are not shown because their Archive eligibility or Tenure evidence is unresolved.</p>}
      <ArchiveTable caption={`${scopeLabels[snapshot.scope]} · ${snapshot.verifiedAsOf}`}>
        <thead><tr><th scope="col">Person and Office</th><th scope="col">Archive Source Documents</th><th scope="col">Declared Financial Summary</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.tenureId}>
          <th scope="row" className="min-w-[12rem]"><Link to={`/official/${row.slug}`} className="underline text-primary-700">{row.canonicalName}</Link><p className="archive-muted font-normal">{row.officeName}</p></th>
          <td><p>{row.documentCount.toLocaleString('en-PH')}</p>{row.documentCount === 0 && <p className="archive-muted">No SALN currently in the archive</p>}</td>
          <td className="min-w-[12rem]">{row.latestSummary ? <p>Declared net worth: ₱{row.latestSummary.declaredNetWorth}</p> : <p>Totals not transcribed</p>}</td>
        </tr>)}</tbody>
      </ArchiveTable>
      <details><summary className="cursor-pointer underline text-primary-700">Roster evidence</summary><ul className="mt-3 space-y-2">{[...new Map(snapshot.members.flatMap(member => member.citations).map(source => [source.id, source])).values()].map(source => <li key={source.id}><a href={source.url} className="underline text-primary-700">{source.title}</a><p className="archive-muted text-sm">{source.publisher} · {source.publishedDate?.value ?? 'Publication date not established'}</p></li>)}</ul></details>
    </section>)}
    <section aria-labelledby="recent-documents" className="space-y-4">
      <h2 id="recent-documents">Recently Added</h2>
      <p className="archive-muted">Source Documents ordered by Archive Publication Date. Reporting Date identifies the declaration period.</p>
      {data.recentlyAdded.length === 0 && <p>No Source Documents are currently in the archive.</p>}
      {data.recentlyAdded.map(document => <EvidenceRow key={document.id} title={document.fileName} href={`/documents/${document.sha256}`} metadata={<><Link to={`/official/${document.slug}`} className="underline text-primary-700">{document.canonicalName}</Link><p>Reporting Date: {document.reportingDate.value} ({document.reportingDate.precision} precision)</p><p>Archive Publication Date: <time dateTime={document.archivePublicationDate}>{document.archivePublicationDate}</time></p></>} />)}
    </section>
  </div>;
}
