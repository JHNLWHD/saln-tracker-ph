import { Form, Link, isRouteErrorResponse, useNavigation, useRouteError } from 'react-router';
import type { Route } from './+types/people';
import { getArchive } from '../archive/archive.server';
import { directoryFilters, directoryHref } from '../archive/directory';
import { Header } from '../components/layout/Header';
import { Footer } from '../components/layout/Footer';
import { ArchiveTable, EmptyState, TextField } from '../components/ui/Archive';
import { Button } from '../components/ui/Button';

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.filters.q ? `Find ${data.filters.q}` : 'Browse People'} | SALN Archive` }, { name: 'description', content: 'Find reviewed elected-office identities by name, Office, Constituency, Jurisdiction and reporting year.' }, { name: 'robots', content: 'noindex,follow' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  let filters;
  try { filters = directoryFilters(new URL(request.url).searchParams); }
  catch { throw new Response('Invalid directory filters', { status: 400 }); }
  return { filters, directory: await (await getArchive()).browsePeople(filters) };
}

export default function People({ loaderData: { filters, directory } }: Route.ComponentProps) {
  const loading = useNavigation().state !== 'idle';
  const pages = Math.max(1, Math.ceil(directory.total / directory.pageSize));
  return <><Header /><main className="archive-container py-8 space-y-6">
    <header className="space-y-3"><h1>Find and browse People</h1><p>Search reviewed names and public-office fields. Document text, article prose and financial amounts are not searched.</p></header>
    <Form method="get" action="/people" className="space-y-4" key={JSON.stringify(filters)} aria-label="Directory filters">
      <TextField id="directory-query" name="q" label="Name or public-office field" defaultValue={filters.q} maxLength={128} type="search" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="archive-field">Office<select className="archive-input" name="office" defaultValue={filters.office}><option value="">All included Offices</option>{directory.offices.map(office => <option key={office.id} value={office.id}>{office.name}</option>)}</select></label>
        <label className="archive-field">Jurisdiction<select className="archive-input" name="jurisdiction" defaultValue={filters.jurisdiction}><option value="">All Jurisdictions</option>{directory.jurisdictions.map(jurisdiction => <option key={jurisdiction.id} value={jurisdiction.id}>{jurisdiction.name}</option>)}</select></label>
        <label className="archive-field">Tenure<select className="archive-input" name="tenure" defaultValue={filters.tenure}><option value="">All verified Tenures</option><option value="current">In a current reviewed roster</option><option value="former">Verified actual end</option></select></label>
        <label className="archive-field">Source Documents<select className="archive-input" name="documents" defaultValue={filters.documents}><option value="">Any acquisition state</option><option value="available">Acquired copy</option><option value="none">Not currently in the archive</option></select></label>
        <TextField id="directory-year" name="year" label="Reporting year" defaultValue={filters.year} inputMode="numeric" pattern="[0-9]{4}" maxLength={4} />
      </div>
      <p className="archive-muted text-sm">Current means membership in the latest reviewed Roster Snapshot for its scope. An unknown actual end does not establish current officeholding. Acquired-copy status records acquisition; open a Source Document to check live availability.</p>
      <div className="flex items-center gap-4"><Button type="submit" loading={loading}>Find People</Button><Link className="underline text-primary-700" to="/people">Clear filters</Link></div>
    </Form>
    <div role="status" aria-live="polite">{loading ? 'Loading reviewed results…' : `${directory.total} matching ${directory.total === 1 ? 'Person' : 'People'}`}</div>
    <section aria-label="Directory results" aria-busy={loading}>
      {directory.rows.length ? <ArchiveTable caption={`Archive-Eligible People · Page ${directory.page} of ${pages}`}><thead><tr><th scope="col">Person</th><th scope="col">Verified included Offices</th><th scope="col">Source Documents</th></tr></thead><tbody>{directory.rows.map(person => <tr key={person.id}><th scope="row"><Link className="underline text-primary-700" to={`/official/${person.slug}`}>{person.canonicalName}</Link></th><td>{person.offices.join('; ')}</td><td>{person.documentCount} {person.documentCount === 0 && <p className="archive-muted">Not currently in the archive</p>}</td></tr>)}</tbody></ArchiveTable> : <EmptyState title="No matching People"><p>Try another reviewed name or remove a filter. This result does not establish a failure to file.</p></EmptyState>}
    </section>
    {pages > 1 && <nav aria-label="Directory pages" className="flex gap-6"><p>Page {directory.page} of {pages}</p>{directory.page > 1 && <Link className="underline" to={directoryHref(filters, directory.page - 1)}>Previous page</Link>}{directory.page < pages && <Link className="underline" to={directoryHref(filters, directory.page + 1)}>Next page</Link>}</nav>}
  </main><Footer /></>;
}

export function ErrorBoundary() {
  const error = useRouteError();
  return <><Header /><main className="archive-container py-8"><h1>{isRouteErrorResponse(error) && error.status === 400 ? 'Invalid directory filters' : 'Directory temporarily unavailable'}</h1><p>Check the filters or try again later.</p><Link className="underline" to="/people">Browse People</Link></main><Footer /></>;
}
