import { Form, Link, isRouteErrorResponse, redirect, useNavigation, useRouteError } from 'react-router';
import type { Route } from './+types/people';
import { getArchive } from '../archive/archive.server';
import { directoryFilters, directoryHref } from '../archive/directory';
import { Header } from '../components/layout/Header';
import { Footer } from '../components/layout/Footer';
import { EmptyState, TextField } from '../components/ui/Archive';
import { Button } from '../components/ui/Button';
import { PersonCard } from '../components/PersonCard';

export function meta({ data }: Route.MetaArgs) {
  const query = data?.filters?.q;
  return [{ title: `${query ? `Find ${query}` : 'Browse People'} | SALN Archive` }, { name: 'description', content: 'Browse preserved legacy SALN entries or search the reviewed Archive.' }, { name: 'robots', content: 'noindex,follow' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const params = new URL(request.url).searchParams;
  const view = params.get('view');
  if (params.getAll('view').length > 1 || (view !== null && view !== 'reviewed')) throw new Response('Invalid directory view', { status: 400 });
  params.delete('view');
  let filters;
  try { filters = directoryFilters(params); }
  catch { throw new Response('Invalid directory filters', { status: 400 }); }
  // Preserve existing links that use reviewed office, tenure, document or period filters.
  if (view !== 'reviewed' && [...params.keys()].every(key => key === 'q')) {
    throw redirect(`/${params.size ? `?${params}` : ''}`, 301);
  }
  return { filters, directory: await (await getArchive()).browsePeople(filters) };
}

export default function People({ loaderData }: Route.ComponentProps) {
  const loading = useNavigation().state !== 'idle';
  const { filters, directory } = loaderData;
  const pages = Math.max(1, Math.ceil(directory.total / directory.pageSize));
  return <><Header /><main className="archive-container py-8 space-y-6">
    <header className="space-y-2"><p className="archive-label">Reviewed SALN Archive</p><h1>Find and browse People</h1><p className="archive-muted">See reviewed totals and open each Person's Filings. People with acquired Source Documents appear first.</p><Link className="inline-flex min-h-11 items-center text-primary-700 underline" to="/">Browse all legacy records and totals</Link></header>
    <Form method="get" action="/people" className="space-y-4" key={JSON.stringify(filters)} aria-label="Directory filters">
      <input type="hidden" name="view" value="reviewed" />
      <div className="flex flex-wrap items-end gap-3"><div className="min-w-0 flex-1"><TextField id="directory-query" name="q" label="Name or public-office field" defaultValue={filters.q} maxLength={128} type="search" /></div><Button type="submit" loading={loading}>Find People</Button></div>
      <details open={Boolean(filters.office || filters.jurisdiction || filters.tenure || filters.documents || filters.year)} className="rounded-lg border border-gray-200 bg-white px-4">
        <summary className="cursor-pointer py-3 font-semibold text-primary-700">Filter by Office, reporting year and Source Documents</summary>
      <div className="grid gap-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="archive-field">Office<select className="archive-input" name="office" defaultValue={filters.office}><option value="">All included Offices</option>{directory.offices.map(office => <option key={office.id} value={office.id}>{office.name}</option>)}</select></label>
        <label className="archive-field">Jurisdiction<select className="archive-input" name="jurisdiction" defaultValue={filters.jurisdiction}><option value="">All Jurisdictions</option>{directory.jurisdictions.map(jurisdiction => <option key={jurisdiction.id} value={jurisdiction.id}>{jurisdiction.name}</option>)}</select></label>
        <label className="archive-field">Tenure<select className="archive-input" name="tenure" defaultValue={filters.tenure}><option value="">All verified Tenures</option><option value="current">In a current reviewed roster</option><option value="former">Verified actual end</option></select></label>
        <label className="archive-field">Source Documents<select className="archive-input" name="documents" defaultValue={filters.documents}><option value="">Any acquisition state</option><option value="available">Acquired copy</option><option value="none">Not currently in the archive</option></select></label>
        <TextField id="directory-year" name="year" label="Reporting year" defaultValue={filters.year} inputMode="numeric" pattern="[0-9]{4}" maxLength={4} />
      </div>
      <p className="archive-muted pb-4 text-sm">Current means membership in the latest reviewed Roster Snapshot for its scope. An unknown actual end does not establish current officeholding. Search uses reviewed names and public-office fields, rather than document text or financial amounts.</p>
      <div className="flex items-center gap-4 pb-4"><Button type="submit" loading={loading}>Apply filters</Button><Link className="underline text-primary-700" to="/people?view=reviewed">Clear filters</Link></div>
      </details>
    </Form>
    <div role="status" aria-live="polite">{loading ? 'Loading reviewed results…' : `${directory.total} matching ${directory.total === 1 ? 'Person' : 'People'}`}</div>
    <section aria-label="Directory results" aria-busy={loading}>
      {directory.rows.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{directory.rows.map(person => <PersonCard key={person.id} person={person} />)}</div> : <EmptyState title="No matching People"><p>Try another reviewed name or remove a filter. This result does not establish a failure to file.</p></EmptyState>}
    </section>
    {pages > 1 && <nav aria-label="Directory pages" className="flex gap-6"><p>Page {directory.page} of {pages}</p>{directory.page > 1 && <Link className="underline" to={directoryHref(filters, directory.page - 1, 'reviewed')}>Previous page</Link>}{directory.page < pages && <Link className="underline" to={directoryHref(filters, directory.page + 1, 'reviewed')}>Next page</Link>}</nav>}
  </main><Footer /></>;
}

export function ErrorBoundary() {
  const error = useRouteError();
  return <><Header /><main className="archive-container py-8"><h1>{isRouteErrorResponse(error) && error.status === 400 ? 'Invalid directory filters' : 'Directory temporarily unavailable'}</h1><p>Check the filters or try again later.</p><Link className="underline" to="/people">Browse People</Link></main><Footer /></>;
}
