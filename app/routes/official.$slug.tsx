import { redirect } from 'react-router';
import type { Route } from './+types/official.$slug';
import { Header } from '../components/layout/Header';
import { Footer } from '../components/layout/Footer';
import { getArchive } from '../archive/archive.server';
import { PersonProfile } from '../components/PersonProfile';

export function meta({ data }: Route.MetaArgs) {
  const name = data?.person.person.canonicalName;
  return [{ title: `${name ?? 'Person'} | SALN Tracker PH` }, { name: 'description', content: name ? `Inspect archived Source Documents and public-office evidence for ${name}.` : 'Inspect the SALN Archive.' }];
}
export async function loader({ params, request }: Route.LoaderArgs) {
  const person = await (await getArchive()).findPersonBySlug(params.slug);
  if (!person) throw new Response('Not Found', { status: 404 });
  if (params.slug !== person.person.slug) throw redirect(`/official/${encodeURIComponent(person.person.slug)}${new URL(request.url).search}`, 301);
  return { person };
}
export default function Person({ loaderData }: Route.ComponentProps) {
  return <><Header /><main className="archive-container py-8 sm:py-12"><PersonProfile record={loaderData.person} /></main><Footer /></>;
}
