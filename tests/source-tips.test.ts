import { routeArgs } from './route-args';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { connectArchive } from '../app/db/client.server';
import { initializeSourceTipDestination, queueSourceTip, readSourceTipBody, sourceTipDestination, sourceTipsConfigured, validateSourceTip } from '../app/db/source-tips.server';
import { exportPublicSnapshot } from '../app/archive/snapshot.server';
import { migrateArchive } from '../scripts/migrate';
import SourceTip, { action, headers, loader } from '../app/routes/source-tip';

const valid = { sourceUrl: 'https://example.invalid/reviewed-source', explanation: 'Synthetic source for private reviewer verification.', contact: 'private@example.invalid', personHint: 'person-risa-hontiveros', website: '' };
test('Source Tip boundary rejects credentials, uploads and public database aliases and bounds Unicode bodies', async () => {
  const remote = { SOURCE_TIPS_DATABASE_URL: 'libsql://private.example.invalid', TURSO_DATABASE_URL: 'libsql://archive.example.invalid', TURSO_AUTH_TOKEN: 'synthetic-archive-token', SOURCE_TIPS_AUTH_TOKEN: 'synthetic-private-token' };
  assert.equal(sourceTipDestination(remote).authToken, remote.SOURCE_TIPS_AUTH_TOKEN);
  assert.throws(() => sourceTipDestination({ ...remote, SOURCE_TIPS_AUTH_TOKEN: remote.TURSO_AUTH_TOKEN }), /separate private database token/);
  for (const url of ['file:.data/archive.db?tls=0', 'file:.data/archive.db?cache=shared', 'file:.data/%61rchive.db', `file://${process.cwd()}/.data/archive.db`]) {
    assert.throws(() => sourceTipDestination({ SOURCE_TIPS_DATABASE_URL: url }), /separate private database/);
  }
  const local = { SOURCE_TIPS_DATABASE_URL: 'file:.data/private-tips.db', SOURCE_TIPS_RATE_LIMIT_SECRET: 'synthetic-key-with-at-least-32-characters' };
  assert.equal(sourceTipsConfigured(local), true);
  for (const deployed of [{ NETLIFY: 'true' }, { SITE_ID: 'synthetic-function-site' }, { NODE_ENV: 'production' }]) {
    assert.equal(sourceTipsConfigured({ ...local, ...deployed }), false);
    assert.throws(() => sourceTipDestination({ ...local, ...deployed }), /hosted private database/);
  }
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
  const env = { TURSO_DATABASE_URL: publicUrl, SOURCE_TIPS_DATABASE_URL: privateUrl, SOURCE_TIPS_RATE_LIMIT_SECRET: '' }, old = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  async function submit(values = valid, extraHeaders: Record<string, string> = {}) { return action(routeArgs({ request: new Request('http://localhost/source-tip', { method: 'POST', body: new URLSearchParams(values), headers: { Origin: 'http://localhost', 'Content-Type': 'application/x-www-form-urlencoded', ...extraHeaders } }), params: {}, context: { ip: '127.0.0.1' } }, '/source-tip')); }
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
    const failure = await submit(); assert.equal(failure.init?.status, 503); assert.ok(!failure.data.success); assert.deepEqual(failure.data.values, validateSourceTip(new URLSearchParams(valid)).values);
    assert.equal(new Headers(failure.init?.headers).get('Cache-Control'), 'no-store');
    const loaderData = loader(routeArgs({ request: new Request('http://localhost/source-tip'), params: {}, context: {} }, '/source-tip')).data;
    const renderForm = (actionData?: ComponentProps<typeof SourceTip>['actionData']) => {
      const router = createMemoryRouter([{ path: '/source-tip', element: createElement(SourceTip, { loaderData, actionData, params: {}, matches: [
        { id: 'root', pathname: '/', params: {}, data: undefined, loaderData: undefined, handle: undefined },
        { id: 'routes/source-tip', pathname: '/source-tip', params: {}, data: loaderData, loaderData, handle: undefined },
      ] }) }], { initialEntries: ['/source-tip'] });
      try { return renderToStaticMarkup(createElement(RouterProvider, { router })); } finally { router.dispose(); }
    };
    const failedForm = renderForm(failure.data);
    assert.ok(failedForm.includes('aria-label="Private Source Tip"'), 'A failed submission remains editable when configuration disappears');
    for (const value of [valid.sourceUrl, valid.explanation, valid.contact]) assert.ok(failedForm.includes(value));
    assert.ok(!renderForm().includes('aria-label="Private Source Tip"'), 'A fresh unconfigured GET still has no form');
    process.env.SOURCE_TIPS_DATABASE_URL = privateUrl;
    await privateDb.client.execute("with recursive n(i) as (select 1 union all select i+1 from n where i < 999) insert into source_tips (id, source_url, explanation, contact, person_hint, received_at) select 'test-' || i, 'https://example.invalid', 'Synthetic queue item', null, null, '2026-10-02T00:00:00.000Z' from n");
    assert.equal((await submit()).init?.status, 503); assert.equal((await privateDb.client.execute('select count(*) as total from source_tips')).rows[0].total, 1000);
  } finally { publicDb.client.close(); privateDb.client.close(); for (const [key, value] of Object.entries(old)) if (value === undefined) delete process.env[key]; else process.env[key] = value; await rm(folder, { recursive: true, force: true }); }
});

test('native multiline Source Tips use textarea character limits for every line ending', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'saln-tip-lines-')), url = `file:${join(folder, 'tips.db')}`;
  const { client } = connectArchive({ url });
  const env = { SOURCE_TIPS_DATABASE_URL: url, SOURCE_TIPS_RATE_LIMIT_SECRET: '' };
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  const explanation = 'a'.repeat(3983) + '\nparagraph\nextra!'; // Exactly 4,000 textarea characters.
  const submit = (text: string) => action(routeArgs({ request: new Request('http://localhost/source-tip', {
    method: 'POST', headers: { Origin: 'http://localhost' }, body: new URLSearchParams({ ...valid, explanation: text }),
  }), params: {}, context: { ip: '127.0.0.1' } }, '/source-tip'));
  try {
    Object.assign(process.env, env); await initializeSourceTipDestination(client);
    for (const ending of ['\n', '\r\n', '\r']) {
      const response = await submit(explanation.replaceAll('\n', ending));
      assert.equal(response.data.success, true, 'Native newline encoding must not reject a permitted explanation');
    }
    const rows = (await client.execute('SELECT explanation FROM source_tips')).rows;
    assert.deepEqual(rows.map(row => row.explanation), [explanation, explanation, explanation]);
    assert.equal((await submit(explanation + 'x')).init?.status, 400);
    assert.equal((await submit('ab\r\ncdef')).init?.status, 400, 'CRLF must not inflate a short explanation past the minimum');
  } finally { client.close(); for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value; await rm(folder, { recursive: true, force: true }); }
});

test('private queue throttles one trusted client atomically without storing addresses or trusting request headers', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'saln-tip-limit-')), url = `file:${join(folder, 'tips.db')}`;
  const { client } = connectArchive({ url });
  const env = { SOURCE_TIPS_DATABASE_URL: url, SOURCE_TIPS_RATE_LIMIT_SECRET: 'synthetic-private-rate-key-at-least-32-characters' };
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  const { website: _honeypot, ...tip } = valid;
  try {
    await initializeSourceTipDestination(client); await initializeSourceTipDestination(client); Object.assign(process.env, env);
    for (let i = 0; i < 4; i++) assert.ok(await queueSourceTip(tip, '192.0.2.1', env));
    const attempts = await Promise.allSettled(Array.from({ length: 6 }, () => queueSourceTip(tip, '192.0.2.1', env)));
    assert.equal(attempts.filter(result => result.status === 'fulfilled' && result.value).length, 1);
    const stored = await client.execute('SELECT * FROM source_tips'); assert.equal(stored.rows.length, 5); assert.ok(!JSON.stringify(stored.rows).includes('192.0.2.1'));
    const response = await action(routeArgs({ request: new Request('http://localhost/source-tip.data', { method: 'POST', body: new URLSearchParams(valid), headers: { Origin: 'http://localhost', 'X-Forwarded-For': '192.0.2.99' } }), params: {}, context: { ip: '192.0.2.1' } }, '/source-tip'));
    assert.equal(response.init?.status, 429); assert.equal(new Headers(response.init?.headers).get('Retry-After'), '600');
    assert.ok(!response.data.success); assert.deepEqual(response.data.values, tip);
    const documentHeaders = new Headers(headers({ actionHeaders: new Headers(response.init?.headers) }));
    assert.equal(documentHeaders.get('Retry-After'), '600'); assert.equal(documentHeaders.get('Cache-Control'), 'no-store');
    assert.ok(await queueSourceTip(tip, '192.0.2.2', env));
    await assert.rejects(queueSourceTip(tip, undefined, { ...env, NETLIFY: 'true' }));
    await client.execute("UPDATE source_tips SET received_at = '2000-01-01T00:00:00.000Z'");
    assert.ok(await queueSourceTip(tip, '192.0.2.1', env));
  } finally { client.close(); for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value; await rm(folder, { recursive: true, force: true }); }
});
