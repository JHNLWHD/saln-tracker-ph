import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkDevelopEnvironment } from '../scripts/develop-preflight';
import { connectArchive } from '../app/db/client.server';
import { migrateArchive } from '../scripts/migrate';
import { exportPublicSnapshot } from '../app/archive/snapshot.server';

test('develop build checks reject ambiguous targets and credential exposure without performing writes', () => {
  const staging = { NETLIFY: 'true', CONTEXT: 'branch-deploy', BRANCH: 'develop', ARCHIVE_ENVIRONMENT: 'staging', ARCHIVE_ADAPTER: 'turso', ARCHIVE_STORAGE: 'r2', TURSO_DATABASE_URL: 'libsql://archive-staging.example.invalid', TURSO_AUTH_TOKEN: 'synthetic-read-token', STAGING_TURSO_HOST: 'archive-staging.example.invalid', R2_ENDPOINT: 'https://r2.example.invalid', R2_BUCKET: 'documents-staging', STAGING_R2_BUCKET: 'documents-staging', R2_ACCESS_KEY_ID: 'synthetic-read-key', R2_SECRET_ACCESS_KEY: 'synthetic-read-secret', SOURCE_TIPS_DATABASE_URL: 'libsql://tips-staging.example.invalid', SOURCE_TIPS_AUTH_TOKEN: 'synthetic-private-token', STAGING_SOURCE_TIPS_HOST: 'tips-staging.example.invalid' };
  assert.doesNotThrow(() => checkDevelopEnvironment(staging));
  for (const changed of [{ BRANCH: 'main' }, { CONTEXT: 'deploy-preview' }, { ARCHIVE_ADAPTER: 'firebase' }, { TURSO_DATABASE_URL: 'libsql://production.example.invalid' }, { R2_BUCKET: 'production' }, { SOURCE_TIPS_DATABASE_URL: staging.TURSO_DATABASE_URL }, { SOURCE_TIPS_AUTH_TOKEN: staging.TURSO_AUTH_TOKEN }, { VITE_DATABASE_TOKEN: 'synthetic-exposure' }, { PRODUCTION_R2_SECRET_ACCESS_KEY: 'synthetic-exposure' }]) assert.throws(() => checkDevelopEnvironment({ ...staging, ...changed }));
  assert.doesNotThrow(() => checkDevelopEnvironment({}));
  assert.doesNotThrow(() => checkDevelopEnvironment({ NETLIFY: 'true', CONTEXT: 'production' }));
});

test('public snapshot routes read the named SQL database, return matching digests and support HEAD/revalidation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'saln-public-route-'));
  const previous = { ARCHIVE_ADAPTER: process.env.ARCHIVE_ADAPTER, TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL, TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN };
  const url = `file:${join(directory, 'archive.db')}`, { client, db } = connectArchive({ url });
  try {
    await migrateArchive(db);
    process.env.ARCHIVE_ADAPTER = 'turso'; process.env.TURSO_DATABASE_URL = url; delete process.env.TURSO_AUTH_TOKEN;
    const { loader } = await import('../app/routes/data.$file');
    const read = (file: string, method = 'GET', headers = {}) => loader({ request: new Request(`http://localhost/data/${file}`, { method, headers }), params: { file }, context: {} });
    const before = await exportPublicSnapshot(db);
    const response = await read('archive.json'); assert.equal(response.status, 200);
    assert.equal(await response.text(), before.snapshotJson);
    assert.equal(await (await read('source-checksums.json')).text(), before.checksumManifestJson);
    const etag = response.headers.get('ETag')!;
    assert.equal((await read('archive.json', 'GET', { 'If-None-Match': etag })).status, 304);
    assert.equal(await (await read('archive.json', 'HEAD')).text(), '');
    assert.equal((await read('archive.json', 'DELETE')).status, 405);
    await assert.rejects(read('private.json'), error => error instanceof Response && error.status === 404);
    process.env.ARCHIVE_ADAPTER = 'firebase';
    await assert.rejects(read('archive.json'), error => error instanceof Response && error.status === 503);
    assert.equal((await exportPublicSnapshot(db)).snapshot.version, before.snapshot.version);
  } finally {
    client.close(); for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(directory, { recursive: true, force: true });
  }
});
