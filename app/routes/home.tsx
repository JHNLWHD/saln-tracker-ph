import type { Route } from './+types/home';
import { Header } from '../components/layout/Header';
import { Footer } from '../components/layout/Footer';
import { getArchive } from '../archive/archive.server';
import { ArchiveHome } from '../components/ArchiveHome';
import { readLegacyRecords } from '../db/legacy.server';
import { LegacyDirectory } from '../components/LegacyRecords';

export function meta() {
  return [{ title: 'SALN Archive | SALN Tracker PH' }, { name: 'description', content: 'Explore preserved SALN totals and entries, with a separate Archive of reviewed Source Documents and Transcriptions.' }];
}
export async function loader({ request }: Route.LoaderArgs) {
  if (new URL(request.url).searchParams.get('view') !== 'reviewed') {
    const legacy = await readLegacyRecords();
    if (legacy) return { legacy };
  }
  return { archive: await (await getArchive()).readHome() };
}
export default function Home({ loaderData }: Route.ComponentProps) {
  return <><Header /><main className="archive-container py-8 sm:py-12">{loaderData.legacy ? <LegacyDirectory data={loaderData.legacy} directoryPath="/people" /> : <ArchiveHome data={loaderData.archive} />}</main><Footer /></>;
}
