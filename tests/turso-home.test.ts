import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { connectArchive } from '../app/db/client.server';
import { importReviewedPerson } from '../app/db/people.server';
import { closeArchive } from '../app/archive/archive.server';
import { migrateArchive } from '../scripts/migrate';
import { loader } from '../app/routes/home';

test('Turso home lists its reviewed People without attempting a legacy Firebase read', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'saln-turso-home-')), url = `file:${join(folder, 'archive.db')}`;
  const { client, db } = connectArchive({ url });
  const env = { ARCHIVE_ADAPTER: 'turso', TURSO_DATABASE_URL: url }, old = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, env); await migrateArchive(db);
    const manifest = JSON.parse(await readFile(new URL('../data/reviewed/0001-ferdinand-marcos-jr.json', import.meta.url), 'utf8'));
    await importReviewedPerson(db, manifest);
    const result = await loader({ request: new Request('http://localhost/'), params: {}, context: {} });
    assert.equal(result.people.length, 1); assert.equal(result.people[0].person.slug, manifest.person.slug); assert.deepEqual(result.officials, []);
  } finally { await closeArchive(); client.close(); for (const [key, value] of Object.entries(old)) if (value === undefined) delete process.env[key]; else process.env[key] = value; await rm(folder, { recursive: true, force: true }); }
});
