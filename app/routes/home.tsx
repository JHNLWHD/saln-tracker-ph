import type { Route } from './+types/home';
import { Header } from '../components/layout/Header';
import { Footer } from '../components/layout/Footer';
import { getArchive } from '../archive/archive.server';
import { ArchiveHome } from '../components/ArchiveHome';

export function meta() {
  return [{ title: 'SALN Archive | SALN Tracker PH' }, { name: 'description', content: 'Find acquired SALN Source Documents and reviewed Transcriptions for Philippine elected officeholders.' }];
}
export async function loader({}: Route.LoaderArgs) { return { archive: await (await getArchive()).readHome() }; }
export default function Home({ loaderData }: Route.ComponentProps) {
  return <><Header /><main className="archive-container py-8 sm:py-12"><ArchiveHome data={loaderData.archive} /></main><Footer /></>;
}
