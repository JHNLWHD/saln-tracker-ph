import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { connectArchive } from '../app/db/client.server';
import { applyReviewedManifest, manifestDigest, validateReviewedManifest } from '../app/db/manifests.server';
import { exportPublicSnapshot } from '../app/archive/snapshot.server';
import { createDbArchive } from '../app/db/people.server';
import { migrateArchive } from './migrate';
import { createLocalDocumentStorage } from '../app/storage/objects.server';

export async function rehearseStageOne(sourceFiles: Record<string, string> = {}, planFile = new URL('../data/release/stage-one.json', import.meta.url)) {
  const plan = JSON.parse(await readFile(planFile, 'utf8'));
  if (!sourceFiles || typeof sourceFiles !== 'object' || Array.isArray(sourceFiles) || Object.entries(sourceFiles).some(([path, file]) => !plan.manifests.includes(path) || typeof file !== 'string' || !file)) throw new Error('Source files must map release manifest paths to local acquired files');
  const directory = await mkdtemp(join(tmpdir(), 'saln-release-'));
  const { client, db } = connectArchive({ url: `file:${join(directory, 'archive.db')}` });
  try {
    await migrateArchive(db);
    const manifests = [];
    const storage = createLocalDocumentStorage(join(directory, 'objects'));
    for (const path of plan.manifests as string[]) {
      if (!/^[A-Za-z0-9_./-]+\.json$/.test(path) || path.includes('..')) throw new Error('Invalid reviewed manifest path');
      const input = JSON.parse(await readFile(new URL(`../reviewed/${path}`, planFile), 'utf8'));
      const manifest = validateReviewedManifest(input.kind ? input : { id: `person:${input.person.id}`, version: 1, kind: 'person', payload: input });
      if (manifest.kind === 'filing' && !sourceFiles[path]) throw new Error('A release Filing requires its local acquired source file');
      if (manifest.kind !== 'filing' && sourceFiles[path]) throw new Error('Only Filing manifests accept acquired source files');
      const options = manifest.kind === 'filing' ? { bytes: await readFile(sourceFiles[path]), storage } : {};
      assert.equal((await applyReviewedManifest(db, manifest, options)).status, 'applied');
      manifests.push({ manifest, options });
    }
    const artifacts = await exportPublicSnapshot(db), archive = createDbArchive(db);
    const counts = Object.fromEntries(Object.entries(artifacts.snapshot.data).map(([key, rows]) => [key, rows.length]));
    const home = await archive.readHome();
    assert.equal(artifacts.snapshot.data.people.length, 27); assert.equal(artifacts.snapshot.data.tenures.length, 29);
    assert.deepEqual(home.rosters.map(row => [row.snapshot.scope, new Set(row.rows.map(person => person.personId)).size]), [['executive', 2], ['senate', 24], ['speaker', 1]]);
    for (const person of artifacts.snapshot.data.people) assert.equal((await archive.findPersonBySlug(person.slug))?.person.id, person.id);
    for (const alias of artifacts.snapshot.data.personAliases) assert.equal((await archive.findPersonBySlug(alias.value))?.person.id, alias.personId);
    for (const { manifest, options } of manifests) assert.equal((await applyReviewedManifest(db, manifest, options)).status, 'unchanged');
    assert.equal((await exportPublicSnapshot(db)).snapshotJson, artifacts.snapshotJson);
    const migrations = await client.execute('SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at');
    const expectation = { counts, snapshotVersion: artifacts.snapshot.version, manifests: manifests.map(({ manifest }) => ({ id: manifest.id, digest: manifestDigest(manifest) })), migrations: migrations.rows };
    return { expectation, artifacts, publicationReviewPending: plan.publicationReviewPending as string[] };
  } finally { client.close(); await rm(directory, { recursive: true, force: true }); }
}

/** Reads an already deployed release. It cannot deploy, migrate or import remotely. */
export async function verifyReleaseHttp(base: string, revision: string, artifacts: Awaited<ReturnType<typeof exportPublicSnapshot>>) {
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Use the deployment origin without credentials or a path');
  const get = (path: string, init?: RequestInit) => fetch(new URL(path, url), { signal: AbortSignal.timeout(30000), ...init });
  const ping = await get('/ping'); assert.equal(ping.status, 200); assert.equal(ping.headers.get('X-Archive-Revision'), revision);
  const metadata = await get('/data/archive.json'); assert.equal(metadata.status, 200); assert.equal(await metadata.text(), artifacts.snapshotJson);
  const checksums = await get('/data/source-checksums.json'); assert.equal(checksums.status, 200); assert.equal(await checksums.text(), artifacts.checksumManifestJson);
  for (const [file, contents] of [['archive.json', artifacts.snapshotJson], ['source-checksums.json', artifacts.checksumManifestJson]]) {
    const canonical = await get(`/data/${artifacts.snapshot.version}/${file}`); assert.equal(canonical.status, 200); assert.equal(await canonical.text(), contents);
  }
  const paths = ['/', '/people', '/about', '/resources', '/source-tip'];
  for (const person of artifacts.snapshot.data.people) paths.push(`/official/${encodeURIComponent(person.slug)}`);
  for (const path of paths) {
    const response = await get(path); assert.equal(response.status, 200, path);
    const html = await response.text(); assert.doesNotMatch(html, /"reviewedBy"|documents\/sha256\//, path);
  }
  assert.equal((await get('/unknown-release-check-path')).status, 404);
  for (const alias of artifacts.snapshot.data.personAliases) {
    const person = artifacts.snapshot.data.people.find(person => person.id === alias.personId)!;
    if (alias.value === person.slug) continue;
    const response = await get(`/official/${encodeURIComponent(alias.value)}`, { redirect: 'manual' });
    assert.equal(response.status, 301);
    const target = new URL(response.headers.get('Location')!, url);
    assert.equal(target.origin, url.origin); assert.equal(target.pathname, `/official/${person.slug}`);
  }
  for (const document of artifacts.checksumManifest.documents) {
    const response = await get(`/documents/${document.sha256}`); assert.equal(response.status, 200);
    const bytes = new Uint8Array(await response.arrayBuffer()); assert.equal(bytes.byteLength, document.byteSize); assert.equal(createHash('sha256').update(bytes).digest('hex'), document.sha256);
  }
  return { revision, origin: url.origin, checkedRoutes: paths.length, checkedAliases: artifacts.snapshot.data.personAliases.length, checkedChecksums: artifacts.checksumManifest.documents.length };
}

async function main() {
  const { positionals, values } = parseArgs({ options: { sources: { type: 'string' } }, allowPositionals: true });
  const [output, base, revision, ...extra] = positionals;
  if (!output || extra.length || Boolean(base) !== Boolean(revision)) throw new Error('Usage: archive:verify-release -- private-report.json [deployment-origin deployed-revision] [--sources private-source-files.json]');
  const result = await rehearseStageOne(values.sources ? JSON.parse(await readFile(values.sources, 'utf8')).sourceFiles : {});
  const plan = JSON.parse(await readFile(new URL('../data/release/stage-one.json', import.meta.url), 'utf8'));
  assert.deepEqual(result.expectation, plan.expected, 'Release metadata does not match the reviewed reconciliation baseline');
  const http = base ? await verifyReleaseHttp(base, revision!, result.artifacts) : null;
  const report = { status: 'not_accepted', observedAt: new Date().toISOString(), rehearsal: 'empty local database migrated, imported once and verified unchanged on replay', ...result.expectation, http, publicationReviewPending: result.publicationReviewPending, pending: ['Exact deployed revision build/typecheck evidence', 'Live staging migration/import/resource inventory', 'Legacy PDF URL and R2 byte mapping', 'Manual browser journeys, Source Tip private persistence and no Firebase network traffic', 'Explicit user acceptance'] };
  await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ status: report.status, snapshotVersion: report.snapshotVersion, counts: report.counts, http }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('Release verification failed; acceptance is blocked. Inspect the named deployment and reviewed baseline.'); process.exitCode = 1; });
