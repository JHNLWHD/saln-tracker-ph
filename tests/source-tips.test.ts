import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { connectArchive } from '../app/db/client.server';
import { initializeSourceTipDestination, readSourceTipBody, sourceTipDestination, validateSourceTip } from '../app/db/source-tips.server';
import { exportPublicSnapshot } from '../app/archive/snapshot.server';
import { migrateArchive } from '../scripts/migrate';
import { action } from '../app/routes/source-tip';

const valid = { sourceUrl: 'https://example.invalid/reviewed-source', explanation: 'Synthetic source for private reviewer verification.', contact: 'private@example.invalid', personHint: 'person-risa-hontiveros', website: '' };
test('Source Tip boundary rejects credentials, uploads and public database aliases and bounds Unicode bodies', async () => {
  for (const env of [{ SOURCE_TIPS_DATABASE_URL: 'file:.data/archive.db' }, { SOURCE_TIPS_DATABASE_URL: 'libsql://same-host', TURSO_DATABASE_URL: 'https://same-host', SOURCE_TIPS_AUTH_TOKEN: 'test' }, { SOURCE_TIPS_DATABASE_URL: 'https://user:secret@example.org', SOURCE_TIPS_AUTH_TOKEN: 'test' }]) assert.throws(() => sourceTipDestination(env));
  assert.throws(() => validateSourceTip(new URLSearchParams({ ...valid, upload: 'file' })));
  assert.throws(() => validateSourceTip(new URLSearchParams('sourceUrl=https://example.org&sourceUrl=https://example.org')));
  assert.ok(validateSourceTip(new URLSearchParams({ ...valid, sourceUrl: 'https://user:secret@example.org' })).errors.sourceUrl);
  const text = '文'.repeat(4000), request = new Request('http://localhost/source-tip', { method: 'POST', body: new URLSearchParams({ ...valid, explanation: text }) });
  assert.equal((await readSourceTipBody(request)).get('explanation'), text);
  await assert.rejects(readSourceTipBody(new Request('http://localhost/source-tip', { method: 'POST', body: 'a'.repeat(65537) })), /too large/);
});

test('anonymous Source Tip action commits only to its private destination, with safe failures and no snapshot mutation', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'saln-tips-')), publicUrl = `file:${join(folder, 'archive.db')}`, privateUrl = `file:${join(folder, 'tips.db')}`;
  const publicDb = connectArchive({ url: publicUrl }), privateDb = connectArchive({ url: privateUrl });
  const env = { TURSO_DATABASE_URL: publicUrl, SOURCE_TIPS_DATABASE_URL: privateUrl }, old = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  async function submit(values = valid, extraHeaders: Record<string, string> = {}) { return action({ request: new Request('http://localhost/source-tip', { method: 'POST', body: new URLSearchParams(values), headers: { Origin: 'http://localhost', 'Content-Type': 'application/x-www-form-urlencoded', ...extraHeaders } }), params: {}, context: {} }); }
  try {
    Object.assign(process.env, env); await migrateArchive(publicDb.db); await initializeSourceTipDestination(privateDb.client);
    const before = await exportPublicSnapshot(publicDb.db);
    const accepted = await submit(); assert.equal(accepted.data.success, true); assert.equal(accepted.init?.headers && new Headers(accepted.init.headers).get('Cache-Control'), 'no-store');
    const stored = await privateDb.client.execute('select * from source_tips'); assert.equal(stored.rows.length, 1); assert.equal(stored.rows[0].contact, valid.contact); assert.equal(stored.rows[0].explanation, valid.explanation);
    assert.equal((await exportPublicSnapshot(publicDb.db)).snapshotJson, before.snapshotJson);
    assert.equal((await submit({ ...valid, explanation: '' })).init?.status, 400);
    assert.equal((await submit(valid, { Origin: 'https://other.example' })).init?.status, 403);
    assert.equal((await submit(valid, { 'Content-Type': 'multipart/form-data' })).init?.status, 415);
    assert.equal((await submit({ ...valid, website: 'bot' })).data.success, true); assert.equal((await privateDb.client.execute('select * from source_tips')).rows.length, 1);
    delete process.env.SOURCE_TIPS_DATABASE_URL;
    const failure = await submit(); assert.equal(failure.init?.status, 503); assert.ok(!JSON.stringify(failure).includes(valid.contact));
    process.env.SOURCE_TIPS_DATABASE_URL = privateUrl;
    await privateDb.client.execute("with recursive n(i) as (select 1 union all select i+1 from n where i < 999) insert into source_tips select 'test-' || i, 'https://example.invalid', 'Synthetic queue item', null, null, '2026-10-02T00:00:00.000Z' from n");
    assert.equal((await submit()).init?.status, 503); assert.equal((await privateDb.client.execute('select count(*) as total from source_tips')).rows[0].total, 1000);
  } finally { publicDb.client.close(); privateDb.client.close(); for (const [key, value] of Object.entries(old)) if (value === undefined) delete process.env[key]; else process.env[key] = value; await rm(folder, { recursive: true, force: true }); }
});
