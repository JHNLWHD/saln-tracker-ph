import { pathToFileURL } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { serializePublicSnapshot } from '../app/archive/snapshot.server';
import release from '../data/release/public-snapshot.json';
import { sourceTipDestination } from '../app/db/source-tips.server';

/** Configuration checks only. Builds never open a database or write an object. */
export function checkDevelopEnvironment(env: NodeJS.ProcessEnv) {
  if (env.NETLIFY !== 'true' || env.CONTEXT === 'production') return;
  if (env.CONTEXT !== 'branch-deploy' || env.BRANCH !== 'develop') throw new Error('Only the isolated develop branch may use staging resources');
  if (env.ARCHIVE_ENVIRONMENT !== 'staging' || env.ARCHIVE_ADAPTER !== 'turso' || env.ARCHIVE_STORAGE !== 'r2') throw new Error('Develop requires the staging Turso/R2 Archive');
  const host = (value: string | undefined) => {
    if (!value) throw new Error('A staging database URL is required');
    const url = new URL(value);
    if (!['https:', 'libsql:'].includes(url.protocol) || url.username || url.password) throw new Error('Staging databases require credential-free remote URLs');
    return url.hostname;
  };
  if (!env.STAGING_TURSO_HOST || host(env.TURSO_DATABASE_URL) !== env.STAGING_TURSO_HOST) throw new Error('Archive database does not match the reviewed staging target');
  if (!env.STAGING_SOURCE_TIPS_HOST || host(env.SOURCE_TIPS_DATABASE_URL) !== env.STAGING_SOURCE_TIPS_HOST) throw new Error('Private database does not match the reviewed staging target');
  if (!env.STAGING_R2_BUCKET || env.R2_BUCKET !== env.STAGING_R2_BUCKET) throw new Error('Document bucket does not match the reviewed staging target');
  const endpoint = new URL(env.R2_ENDPOINT ?? '');
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) throw new Error('R2 requires a credential-free HTTPS endpoint');
  if (!env.STAGING_R2_ENDPOINT || endpoint.href !== new URL(env.STAGING_R2_ENDPOINT).href) throw new Error('R2 endpoint does not match the reviewed staging account and jurisdiction');
  for (const key of ['TURSO_AUTH_TOKEN', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) if (!env[key]) throw new Error('Staging runtime credentials are missing');
  sourceTipDestination(env);
  if ((env.SOURCE_TIPS_RATE_LIMIT_SECRET?.length ?? 0) < 32) throw new Error('A private Source Tip rate-limit key is required');
  if (env.TURSO_AUTH_TOKEN === env.SOURCE_TIPS_AUTH_TOKEN) throw new Error('Public and private destinations require separate credentials');
  for (const [key, value] of Object.entries(env)) if (value && /^(?:VITE_(?:.*(?:TOKEN|SECRET|DATABASE)|(?:TURSO|R2|SOURCE_TIPS).*)|(?:PRODUCTION|PROD)_(?:TURSO|R2|SOURCE_TIPS).*?(?:TOKEN|KEY|SECRET))$/i.test(key)) throw new Error('Production or browser-visible data credentials are not allowed in staging');
}

export async function checkSnapshotArtifacts(root = 'public/data', version = release.version) {
  assert.match(version, /^[a-f0-9]{64}$/, 'Invalid release snapshot version');
  const directories = await readdir(root, { withFileTypes: true });
  assert.ok(directories.some(entry => entry.isDirectory() && entry.name === version), 'Selected snapshot is absent');
  for (const entry of directories) {
    assert.ok(entry.isDirectory() && /^[a-f0-9]{64}$/.test(entry.name), 'Unexpected public snapshot path');
    const snapshotJson = await readFile(join(root, entry.name, 'archive.json'), 'utf8');
    const checksumJson = await readFile(join(root, entry.name, 'source-checksums.json'), 'utf8');
    const artifacts = serializePublicSnapshot(JSON.parse(snapshotJson).data);
    assert.equal(artifacts.snapshot.version, entry.name, 'Snapshot directory does not match its digest');
    assert.equal(snapshotJson, artifacts.snapshotJson, 'Invalid snapshot artifact');
    assert.equal(checksumJson, artifacts.checksumManifestJson, 'Snapshot pair differs');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { checkDevelopEnvironment(process.env); await checkSnapshotArtifacts(); console.log('Build configuration and immutable snapshot artifacts checked; no data mutation performed.'); }
  catch { console.error('Develop build configuration failed. Verify branch-specific targets and credentials.'); process.exitCode = 1; }
}
