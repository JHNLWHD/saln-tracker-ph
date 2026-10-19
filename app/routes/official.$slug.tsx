import { redirect } from 'react-router';
import type { Route } from './+types/official.$slug';
import { Header } from '../components/layout/Header';
import { Footer } from '../components/layout/Footer';
import { getArchive } from '../archive/archive.server';
import { PersonProfile } from '../components/PersonProfile';
import { readLegacyRecords } from '../db/legacy.server';
import { LegacyPersonProfile } from '../components/LegacyRecords';

export function meta({ data }: Route.MetaArgs) {
  const name = data?.legacy?.name ?? data?.person?.person.canonicalName;
  return [{ title: `${name ?? 'Person'} | SALN Tracker PH` }, { name: 'description', content: name ? `View SALN entries, declared assets, liabilities and net worth for ${name}.` : 'Browse public officials and their SALN entries.' }];
}
export async function loader({ params, request }: Route.LoaderArgs) {
  const person = await (await getArchive()).findPersonBySlug(params.slug);
  if (new URL(request.url).searchParams.get('view') !== 'reviewed') {
    const profiles = (await readLegacyRecords())?.profiles;
    // The former site looked up Firestore document IDs; some stored slug fields differ.
    const aliases = person ? [person.person.slug, ...person.person.legacySlugs] : [];
    const matched = profiles?.filter(profile => aliases.includes(profile.id) || aliases.includes(profile.slug)) ?? [];
    const legacy = profiles?.find(profile => profile.id === params.slug) ?? profiles?.find(profile => profile.slug === params.slug) ?? (matched.length === 1 ? matched[0] : undefined);
    if (legacy) {
      if (params.slug !== legacy.id) throw redirect(`/official/${encodeURIComponent(legacy.id)}${new URL(request.url).search}`, 301);
      return { legacy };
    }
  }
  if (!person) throw new Response('Not Found', { status: 404 });
  if (params.slug !== person.person.slug) throw redirect(`/official/${encodeURIComponent(person.person.slug)}${new URL(request.url).search}`, 301);
  return { person };
}
export default function Person({ loaderData }: Route.ComponentProps) {
  return <><Header /><main className="archive-container py-8 sm:py-12">{loaderData.legacy ? <LegacyPersonProfile profile={loaderData.legacy} /> : <PersonProfile record={loaderData.person} />}</main><Footer /></>;
}
