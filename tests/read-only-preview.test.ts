import assert from 'node:assert/strict';
import test from 'node:test';
import { checkDevelopEnvironment } from '../scripts/develop-preflight';
import { isReadOnlyPreview } from '../app/archive/preview.server';
import { readLegacyRecords } from '../app/db/legacy.server';
import baseline from './fixtures/legacy-public-2026-10-18.json';
import { action as submitTip, loader as tipPage } from '../app/routes/source-tip';
import { queueSourceTip } from '../app/db/source-tips.server';
import { routeArgs } from './route-args';
import { loader as home } from '../app/routes/home';
import { loader as people } from '../app/routes/people';
import { loader as official } from '../app/routes/official.$slug';

const preview = { NETLIFY: 'true', CONTEXT: 'branch-deploy', BRANCH: 'develop', ARCHIVE_ENVIRONMENT: 'preview', ARCHIVE_ADAPTER: 'local', ARCHIVE_STORAGE: 'local', VITE_READ_ONLY_PREVIEW: 'true', ARCHIVE_PREVIEW_BRANCH: 'develop' };

test('develop can build the explicit read-only public-data preview without hosted data services', () => {
  assert.doesNotThrow(() => checkDevelopEnvironment(preview));
});

test('preview rejects misplaced flags, deployment contexts and data services at build and runtime', () => {
  assert.equal(isReadOnlyPreview({}), false);
  for (const change of [
    { CONTEXT: 'production' }, { CONTEXT: 'deploy-preview' }, { BRANCH: 'main' },
    { ARCHIVE_ENVIRONMENT: 'staging' }, { VITE_READ_ONLY_PREVIEW: 'false' },
    { ARCHIVE_ADAPTER: 'turso' }, { ARCHIVE_STORAGE: 'r2' },
    { ARCHIVE_PREVIEW_BRANCH: '' }, { NETLIFY: 'false', SITE_ID: 'synthetic' },
    { TURSO_DATABASE_URL: 'libsql://synthetic.invalid' }, { R2_SECRET_ACCESS_KEY: 'synthetic' },
    { SOURCE_TIPS_DATABASE_URL: 'https://synthetic.invalid' }, { STAGING_R2_BUCKET: 'synthetic' },
  ]) {
    const env = { ...preview, ...change };
    assert.throws(() => checkDevelopEnvironment(env));
    assert.throws(() => isReadOnlyPreview(env));
  }
  assert.equal(isReadOnlyPreview({ ...preview, NETLIFY: undefined, CONTEXT: undefined, BRANCH: undefined, SITE_ID: 'synthetic-site' }), true, 'Functions use the branch-scoped marker because build metadata is unavailable');
  assert.throws(() => checkDevelopEnvironment({ ...preview, CONTEXT: undefined, BRANCH: undefined, SITE_ID: 'synthetic-site' }));
  const falseWithoutMetadata = { ...preview, NETLIFY: 'false', CONTEXT: undefined, BRANCH: undefined };
  assert.throws(() => isReadOnlyPreview(falseWithoutMetadata));
  assert.throws(() => checkDevelopEnvironment(falseWithoutMetadata));
  for (const env of [
    { ...falseWithoutMetadata, NETLIFY: '0' },
    { ARCHIVE_PREVIEW_BRANCH: 'develop' },
  ]) {
    assert.throws(() => isReadOnlyPreview(env));
    assert.throws(() => checkDevelopEnvironment(env));
  }
});

async function inPreview(run: () => Promise<void>) {
  const keys = Object.keys(preview), saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, preview);
  try { await run(); }
  finally { for (const key of keys) if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
}

test('preview serves every preserved public profile and entry without a database and returns independent copies', async () => {
  await inPreview(async () => {
    const data = await readLegacyRecords();
    assert.deepEqual(data, { capturedAt: baseline.capturedAt, profiles: baseline.profiles });
    assert.equal(data?.profiles.length, 49);
    assert.equal(data?.profiles.reduce((sum, row) => sum + row.saln_records.length, 0), 129);
    data!.profiles[0].name = 'changed by a caller';
    assert.equal((await readLegacyRecords())?.profiles[0].name, baseline.profiles[0].name);
  });
});

test('preview Source Tips show a disabled state and reject POST before reading its body or opening a client', async () => {
  await inPreview(async () => {
    const page = tipPage(routeArgs({ request: new Request('http://localhost/source-tip'), params: {}, context: {} }, '/source-tip'));
    assert.equal(page.data.configured, false);
    assert.equal(page.data.readOnlyPreview, true);
    let bodyReads = 0;
    const request = new Proxy(new Request('http://localhost/source-tip', { method: 'POST', body: 'website=honeypot' }), {
      get(target, key) {
        if (key === 'body') { bodyReads++; throw new Error('The disabled form must not read a body'); }
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const result = await submitTip(routeArgs({ request, params: {}, context: {} }, '/source-tip'));
    assert.equal(result.init?.status, 503);
    assert.equal(result.data.success, false);
    assert.equal(bodyReads, 0);
    await assert.rejects(queueSourceTip({ sourceUrl: 'https://synthetic.invalid', explanation: 'Synthetic test', contact: '', personHint: '' }, undefined), /disabled.*preview/);
  });
});

test('preview default routes keep all saved profiles while reviewed-only views give an explicit unavailable response', async () => {
  await inPreview(async () => {
    const data = await home(routeArgs({ request: new Request('http://localhost/'), params: {}, context: {} }, '/'));
    assert.deepEqual(data.legacy?.profiles, baseline.profiles);
    for (const profile of baseline.profiles) {
      const value = await official(routeArgs({ request: new Request(`http://localhost/official/${profile.id}`), params: { slug: profile.id }, context: {} }, '/official/:slug'));
      assert.deepEqual(value.legacy, profile);
    }
    for (const [path, run] of [
      ['/?view=reviewed', () => home(routeArgs({ request: new Request('http://localhost/?view=reviewed'), params: {}, context: {} }, '/'))],
      ['/people?view=reviewed', () => people(routeArgs({ request: new Request('http://localhost/people?view=reviewed'), params: {}, context: {} }, '/people'))],
      ['/official/risa-hontiveros?view=reviewed', () => official(routeArgs({ request: new Request('http://localhost/official/risa-hontiveros?view=reviewed'), params: { slug: 'risa-hontiveros' }, context: {} }, '/official/:slug'))],
    ] as const) {
      await assert.rejects(run, error => error instanceof Response && error.status === 503, path);
    }
    for (const query of ['office=senate', 'year=2024', 'page=2', 'documents=none', 'tenure=current']) {
      await assert.rejects(() => people(routeArgs({ request: new Request(`http://localhost/people?${query}`), params: {}, context: {} }, '/people')), error => error instanceof Response && error.status === 503, query);
    }
  });
});
