import { routeArgs } from './route-args';
import assert from 'node:assert/strict';
import test from 'node:test';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkDevelopEnvironment, checkSnapshotArtifacts } from '../scripts/develop-preflight';
import { connectArchive } from '../app/db/client.server';
import { migrateArchive } from '../scripts/migrate';
import { exportPublicSnapshot } from '../app/archive/snapshot.server';
import { writeSnapshotArtifacts } from '../scripts/export-snapshot';
import { importReviewedPerson } from '../app/db/people.server';
import release from '../data/release/public-snapshot.json';
import { createStaticHandler } from 'react-router';
import * as snapshotRoute from '../app/routes/data.$file';

test('snapshot aliases reject mutation requests through router dispatch with supported methods', async () => {
  const handler = createStaticHandler([{
    path: '/data/:file',
    loader: ({ request, params }) => snapshotRoute.loader(routeArgs({ request, params: { file: params.file! }, context: {} }, '/data/:file')),
    action: snapshotRoute.action && (({ request, params }) => snapshotRoute.action(routeArgs({ request, params: { file: params.file! }, context: {} }, '/data/:file'))),
  }]);
  for (const file of ['archive.json', 'source-checksums.json']) {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const response = await handler.queryRoute(new Request(`http://localhost/data/${file}`, { method }));
      assert.ok(response instanceof Response);
      assert.equal(response.status, 405);
      assert.equal(response.headers.get('Allow'), 'GET, HEAD');
      assert.equal(await response.text(), '');
    }
  }
  await assert.rejects(handler.queryRoute(new Request('http://localhost/data/private.json', { method: 'POST' })), error => error instanceof Response && error.status === 404);
});

test('develop build checks reject ambiguous targets and credential exposure without performing writes', () => {
  const staging = { NETLIFY: 'true', CONTEXT: 'branch-deploy', BRANCH: 'develop', ARCHIVE_ENVIRONMENT: 'staging', ARCHIVE_ADAPTER: 'turso', ARCHIVE_STORAGE: 'r2', TURSO_DATABASE_URL: 'libsql://archive-staging.example.invalid', TURSO_AUTH_TOKEN: 'synthetic-read-token', STAGING_TURSO_HOST: 'archive-staging.example.invalid', R2_ENDPOINT: 'https://r2.example.invalid', STAGING_R2_ENDPOINT: 'https://r2.example.invalid', R2_BUCKET: 'documents-staging', STAGING_R2_BUCKET: 'documents-staging', R2_ACCESS_KEY_ID: 'synthetic-read-key', R2_SECRET_ACCESS_KEY: 'synthetic-read-secret', SOURCE_TIPS_DATABASE_URL: 'libsql://tips-staging.example.invalid', SOURCE_TIPS_AUTH_TOKEN: 'synthetic-private-token', SOURCE_TIPS_RATE_LIMIT_SECRET: 'synthetic-private-rate-key-at-least-32-characters', STAGING_SOURCE_TIPS_HOST: 'tips-staging.example.invalid' };
  assert.doesNotThrow(() => checkDevelopEnvironment(staging));
  for (const [urlKey, hostKey, target] of [
    ['TURSO_DATABASE_URL', 'STAGING_TURSO_HOST', 'archive-staging.example.invalid'],
    ['SOURCE_TIPS_DATABASE_URL', 'STAGING_SOURCE_TIPS_HOST', 'tips-staging.example.invalid'],
  ] as const) {
    for (const protocol of ['libsql', 'https']) {
      assert.throws(() => checkDevelopEnvironment({ ...staging, [urlKey]: `${protocol}://${target}:1443` }));
      assert.doesNotThrow(() => checkDevelopEnvironment({ ...staging, [urlKey]: `${protocol}://${target}:443` }));
      assert.doesNotThrow(() => checkDevelopEnvironment({ ...staging, [urlKey]: `${protocol}://${target}:1443`, [hostKey]: `${target}:1443` }));
    }
    assert.throws(() => checkDevelopEnvironment({ ...staging, [hostKey]: `${target}:1443` }));
    for (const url of [
      `libsql://${target}:443?tls=0`,
      `libsql://${target}?authToken=synthetic-url-token`,
      `https://${target}/unreviewed-database`,
      `libsql://${target}#unreviewed`,
    ]) assert.throws(() => checkDevelopEnvironment({ ...staging, [urlKey]: url }));
  }
  for (const changed of [{ R2_ENDPOINT: 'https://other-account.example.invalid' }, { STAGING_R2_ENDPOINT: '' }, { R2_ENDPOINT: 'https://r2.example.invalid/unreviewed-path' }, { SOURCE_TIPS_RATE_LIMIT_SECRET: '' }, { BRANCH: 'main' }, { CONTEXT: 'deploy-preview' }, { ARCHIVE_ADAPTER: 'firebase' }, { TURSO_DATABASE_URL: 'libsql://production.example.invalid' }, { R2_BUCKET: 'production' }, { SOURCE_TIPS_DATABASE_URL: staging.TURSO_DATABASE_URL }, { SOURCE_TIPS_AUTH_TOKEN: staging.TURSO_AUTH_TOKEN }, { VITE_DATABASE_TOKEN: 'synthetic-exposure' }, { PRODUCTION_R2_SECRET_ACCESS_KEY: 'synthetic-exposure' }]) assert.throws(() => checkDevelopEnvironment({ ...staging, ...changed }));
  assert.doesNotThrow(() => checkDevelopEnvironment({}));
  assert.doesNotThrow(() => checkDevelopEnvironment({ NETLIFY: 'true', CONTEXT: 'production' }));
});

test('snapshot aliases use the release pair without a database and immutable versions survive later imports', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'saln-public-route-'));
  const { client, db } = connectArchive({ url: `file:${join(directory, 'archive.db')}` });
  const root = join(directory, 'public-data');
  try {
    await migrateArchive(db);
    const before = await exportPublicSnapshot(db), first = await writeSnapshotArtifacts(root, before);
    const { loader } = await import('../app/routes/data.$file');
    const read = (file: string, method = 'GET') => loader(routeArgs({ request: new Request(`http://localhost/data/${file}`, { method }), params: { file }, context: {} }, '/data/:file'));
    for (const file of ['archive.json', 'source-checksums.json']) {
      const response = await read(file); assert.equal(response.status, 307);
      assert.equal(response.headers.get('Location'), `/data/${release.version}/${file}`);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.equal((await read(file, 'HEAD')).body, null);
    }
    assert.equal((await read('archive.json', 'DELETE')).status, 405);
    await assert.rejects(read('private.json'), error => error instanceof Response && error.status === 404);
    await importReviewedPerson(db, JSON.parse(await readFile(new URL('../data/reviewed/0001-ferdinand-marcos-jr.json', import.meta.url), 'utf8')));
    const after = await exportPublicSnapshot(db); await writeSnapshotArtifacts(root, after);
    assert.notEqual(after.snapshot.version, before.snapshot.version);
    await checkSnapshotArtifacts(root, after.snapshot.version);
    assert.equal(await readFile(join(first, 'archive.json'), 'utf8'), before.snapshotJson);
    assert.equal(await readFile(join(first, 'source-checksums.json'), 'utf8'), before.checksumManifestJson);
    await assert.rejects(checkSnapshotArtifacts(root, '../private'));
    await assert.rejects(checkSnapshotArtifacts(root, '0'.repeat(64)), /absent/);
    await writeFile(join(first, 'source-checksums.json'), '{}');
    await assert.rejects(checkSnapshotArtifacts(root, after.snapshot.version), /pair differs/);
    await checkSnapshotArtifacts();
  } finally { client.close(); await rm(directory, { recursive: true, force: true }); }
});

test('public snapshot versions contain only the two regular release files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'saln-snapshot-files-'));
  const versionPath = join(root, release.version);
  try {
    await mkdir(versionPath);
    for (const file of ['archive.json', 'source-checksums.json']) {
      await copyFile(join('public/data', release.version, file), join(versionPath, file));
    }
    await checkSnapshotArtifacts(root);
    const extraFile = join(versionPath, 'private-debug.json');
    await writeFile(extraFile, '{"contact":"synthetic@example.invalid"}');
    await assert.rejects(checkSnapshotArtifacts(root), /Unexpected public snapshot file/);
    await rm(extraFile);
    const extraDirectory = join(versionPath, 'private-debug');
    await mkdir(extraDirectory);
    await assert.rejects(checkSnapshotArtifacts(root), /Unexpected public snapshot file/);
    await rm(extraDirectory, { recursive: true });
    const archivePath = join(versionPath, 'archive.json');
    await rm(archivePath);
    await symlink(join(process.cwd(), 'public/data', release.version, 'archive.json'), archivePath);
    await assert.rejects(checkSnapshotArtifacts(root), /regular files/);
    await rm(archivePath);
    await copyFile(join('public/data', release.version, 'archive.json'), archivePath);
    await checkSnapshotArtifacts(root);
  } finally { await rm(root, { recursive: true, force: true }); }
});
