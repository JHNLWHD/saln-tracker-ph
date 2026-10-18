import { Link } from 'react-router';
import type { ArchiveHome as HomeData, RosterRow } from '../archive/types';
import { EmptyState, EvidenceRow } from './ui/Archive';
import { PersonCard } from './PersonCard';

const scopeLabels = { executive: 'President and Vice President', senate: 'Senate', speaker: 'Speaker of the House', house: 'House of Representatives', local: 'Local elected offices' };

export function ArchiveHome({ data }: { data: HomeData }) {
  return <div className="space-y-10">
    <header className="space-y-3">
      <p className="archive-label">Reviewed SALN Archive</p>
      <h1>Explore declared assets and net worth</h1>
      <p className="archive-muted max-w-3xl">See reviewed SALN totals, then open the Source Documents behind the numbers.</p>
      <div className="flex flex-wrap gap-x-6"><Link to="/people?view=reviewed" className="inline-flex min-h-11 items-center font-semibold text-primary-700 underline">Browse reviewed People and reporting periods <span aria-hidden="true" className="ml-2">→</span></Link><Link to="/people" className="inline-flex min-h-11 items-center text-primary-700 underline">Browse all legacy records and totals</Link></div>
    </header>
    {data.rosters.length === 0 && <EmptyState title="No reviewed Roster Snapshot is available"><p>Officeholders will appear after their Tenures and roster membership are reviewed.</p></EmptyState>}
    {data.rosters.map(({ snapshot, rows, omittedMemberCount }) => {
      const cards = new Map<string, RosterRow & { offices: string[] }>();
      for (const row of rows) {
        const card = cards.get(row.personId);
        if (card) card.offices.push(row.officeName);
        else cards.set(row.personId, { ...row, offices: [row.officeName] });
      }
      return <section key={snapshot.id} aria-labelledby={`roster-${snapshot.scope}`} className="space-y-3">
      <h2 id={`roster-${snapshot.scope}`}>{scopeLabels[snapshot.scope]}</h2>
      <p className="text-sm">Roster Snapshot · Verified as of <time dateTime={snapshot.verifiedAsOf}>{snapshot.verifiedAsOf}</time>. Manually reviewed; this is not a live roster.</p>
      {(omittedMemberCount ?? snapshot.members.length - rows.length) > 0 && <p className="archive-muted">Some roster entries are not shown because their Archive eligibility or Tenure evidence is unresolved.</p>}
      <div className={`grid gap-4 ${snapshot.scope === 'executive' ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
        {[...cards.values()].map(person => <PersonCard key={person.personId} person={person} />)}
      </div>
      <details className="text-sm"><summary className="cursor-pointer py-2 underline text-primary-700">Roster evidence and coverage</summary><p className="archive-muted mt-3">People shown from this Snapshot: {new Set(rows.map(row => row.personId)).size}. A reviewed cohort can cover only part of an Office's membership. Archive coverage does not establish compliance or verify real-world wealth.</p><ul className="mt-3 space-y-2">{[...new Map(snapshot.members.flatMap(member => member.citations).map(source => [source.id, source])).values()].map(source => <li key={source.id}><a href={source.url} className="underline text-primary-700">{source.title}</a><p className="archive-muted">{source.publisher} · {source.publishedDate?.value ?? 'Publication date not established'}</p></li>)}</ul></details>
    </section>; })}
    <section aria-labelledby="recent-documents" className="space-y-4">
      <h2 id="recent-documents">Recently Added</h2>
      <p className="archive-muted">Source Documents ordered by Archive Publication Date. Reporting Date identifies the declaration period.</p>
      {data.recentlyAdded.length === 0 && <p>No Source Documents are currently in the archive.</p>}
      {data.recentlyAdded.map(document => <EvidenceRow key={document.id} title={document.fileName} href={`/documents/${document.sha256}`} metadata={<><Link to={`/official/${document.slug}?view=reviewed`} className="underline text-primary-700">{document.canonicalName}</Link><p>Reporting Date: {document.reportingDate.value} ({document.reportingDate.precision} precision)</p><p>Archive Publication Date: <time dateTime={document.archivePublicationDate}>{document.archivePublicationDate}</time></p></>} />)}
    </section>
  </div>;
}
