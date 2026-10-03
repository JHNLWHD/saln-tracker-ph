import { redirect } from 'react-router';
import release from '../../data/release/public-snapshot.json';
import type { Route } from './+types/data.$file';

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!['archive.json', 'source-checksums.json'].includes(params.file)) throw new Response('Not Found', { status: 404 });
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  return redirect(`/data/${release.version}/${params.file}`, { status: 307, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
