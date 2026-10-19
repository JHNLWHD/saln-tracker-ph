import type { Route } from './+types/home';
import { Header } from '../components/layout/Header';
import { Footer } from '../components/layout/Footer';
import { getArchive } from '../archive/archive.server';
import { ArchiveHome } from '../components/ArchiveHome';
import { readLegacyRecords } from '../db/legacy.server';
import { LegacyDirectory } from '../components/LegacyRecords';
import { redirect } from 'react-router';
import { searchText } from '../archive/directory';

export function meta({ data }: Route.MetaArgs) {
  const query = data?.query;
  return [{ title: query ? `Find ${query} | SALN Tracker PH` : 'SALN Tracker PH | Declared assets and net worth' }, { name: 'description', content: 'Explore public officials and their declared assets, liabilities and net worth. Browse SALN entries and sources by year.' }, ...(query ? [{ name: 'robots', content: 'noindex,follow' }] : [])];
}
export async function loader({ request }: Route.LoaderArgs) {
  const params = new URL(request.url).searchParams, view = params.get('view');
  const query = (params.get('q') ?? '').trim();
  if (params.getAll('q').length > 1 || query.length > 128 || params.getAll('view').length > 1 || (view !== null && view !== 'reviewed')) throw new Response('Invalid search', { status: 400 });
  if (view !== 'reviewed') {
    const legacy = await readLegacyRecords();
    if (legacy) return { query, legacy: { ...legacy, profiles: legacy.profiles.filter(profile => [profile.name, profile.position, profile.agency].some(value => value && searchText(value).includes(searchText(query)))) } };
  }
  if (query) throw redirect(`/people?${new URLSearchParams({ q: query, view: 'reviewed' })}`);
  return { archive: await (await getArchive()).readHome() };
}
export default function Home({ loaderData }: Route.ComponentProps) {
  return <><Header /><main className="archive-container py-6 sm:py-8">{loaderData.legacy ? <LegacyDirectory data={loaderData.legacy} query={loaderData.query} /> : <ArchiveHome data={loaderData.archive} />}</main><Footer /></>;
}
