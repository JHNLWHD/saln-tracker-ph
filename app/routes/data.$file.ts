import { connectArchive } from '../db/client.server';
import { exportPublicSnapshot } from '../archive/snapshot.server';
import type { Route } from './+types/data.$file';

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!['archive.json', 'source-checksums.json'].includes(params.file)) throw new Response('Not Found', { status: 404 });
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  if (process.env.ARCHIVE_ADAPTER !== 'turso' || !process.env.TURSO_DATABASE_URL) throw new Response('Snapshot unavailable', { status: 503 });
  const { client, db } = connectArchive({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  try {
    const artifacts = await exportPublicSnapshot(db);
    const etag = `"${artifacts.snapshot.version}:${params.file}"`;
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate', 'X-Content-Type-Options': 'nosniff', ETag: etag };
    if (request.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers });
    return new Response(request.method === 'HEAD' ? null : params.file === 'archive.json' ? artifacts.snapshotJson : artifacts.checksumManifestJson, { headers });
  } finally { client.close(); }
}
