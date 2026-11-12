import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { LegacyDirectory, LegacyPersonProfile } from '../app/components/LegacyRecords';
import { connectArchive } from '../app/db/client.server';
import { migrateArchive } from '../scripts/migrate';
import { legacyCopySchema } from '../scripts/legacy-copy';
import { typedFirestoreValue } from '../scripts/legacy-capture';
import { closeArchive } from '../app/archive/archive.server';
import { exportPublicSnapshot } from '../app/archive/snapshot.server';
import { applyReviewedManifest } from '../app/db/manifests.server';

test('home and profile expose every migrated record without promoting legacy totals into reviewed data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'saln-legacy-display-'));
  const url = `file:${join(directory, 'archive.db')}`, { client, db } = connectArchive({ url });
  const prior = { ARCHIVE_ADAPTER: process.env.ARCHIVE_ADAPTER, TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL, TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN };
  const saln = { year: 2024, total_assets: 1375378062.74, total_liabilities: 0, net_worth: 1375378062.74, date_filed: '2025-04-29', status: 'submitted', source_url: 'https://example.org/source.pdf', source_description: 'Legacy source', assets: [{ description: 'Recorded item', value: 1375378062.74 }], liabilities: [] };
  const profile = { slug: 'short-slug', name: 'Legacy Person', position: 'Commissioner', agency: 'CONSTITUTIONAL_COMMISSION', status: 'active', saln_records: [saln, { ...saln, net_worth: 987.65, total_liabilities: null, source_url: 'javascript:alert(1)' }], privateContact: 'must-not-publish' };
  const documents = [
    { id: 'legacy-person', path: 'officials/legacy-person', data: typedFirestoreValue(profile) },
    { id: 'without-records', path: 'officials/without-records', data: typedFirestoreValue({ slug: 'without-records', name: 'Without records' }) },
    { id: 'opaque-records', path: 'officials/opaque-records', data: typedFirestoreValue({ slug: 'opaque-records', name: 'Opaque records', saln_records: { original: 'retained' } }) },
    { id: 'null-records', path: 'officials/null-records', data: typedFirestoreValue({ slug: 'null-records', name: 'Null records', saln_records: null }) },
  ];
  try {
    await migrateArchive(db);
    await applyReviewedManifest(db, { id: 'identities-legacy-display-test', version: 1, kind: 'identities', payload: {
      review: { reviewedAt: '2026-10-03', reviewedBy: 'Test review' },
      legacyPeople: [{ person: { id: 'person-canonical', slug: 'canonical-person', canonicalName: 'Canonical Test Name', nameVariants: [] }, identifiers: [], slugs: ['legacy-person', 'short-slug'], sourceUrl: 'https://example.org/legacy-person' }], matches: [], documents: [],
    } });
    const before = await exportPublicSnapshot(db);
    for (const sql of legacyCopySchema) await client.execute(sql);
    await client.execute({ sql: 'INSERT INTO legacy_firestore_captures VALUES (?, ?, ?, ?, ?, ?, ?)', args: ['a'.repeat(64), 'saln-tracker-ph', 'public_reader', '2026-10-03T00:00:00.000Z', documents.length, '{}', JSON.stringify(documents)] });
    await client.execute({ sql: 'INSERT INTO legacy_firestore_captures VALUES (?, ?, ?, ?, ?, ?, ?)', args: ['b'.repeat(64), 'saln-tracker-ph', 'public_reader', '2026-10-02T00:00:00.000Z', 1, '{}', JSON.stringify([{ ...documents[0], data: typedFirestoreValue({ ...profile, name: 'Old capture' }) }])] });
    Object.assign(process.env, { ARCHIVE_ADAPTER: 'turso', TURSO_DATABASE_URL: url }); delete process.env.TURSO_AUTH_TOKEN;
    const { loader: home } = await import('../app/routes/home');
    const { loader: person, meta: profileMeta } = await import('../app/routes/official.$slug');
    const args = (path: string) => ({ request: new Request(`http://localhost${path}`), params: {}, context: {} });
    const homeData = await home(args('/'));
    const legacy = homeData.legacy;
    assert.ok(legacy, 'Home must expose the migrated data instead of only the reviewed subset');
    assert.equal(legacy.profiles.length, 4);
    assert.deepEqual(legacy.profiles.slice(1).map(row => row.saln_records.length), [0, 0, 0]);
    assert.equal(legacy.profiles[0].saln_records.length, 2, 'Same-year entries must remain distinct');
    assert.equal(legacy.profiles[0].name, 'Legacy Person', 'Only the latest capture is displayed');
    assert.deepEqual(legacy.profiles[0].saln_records.map(row => row.net_worth), [1375378062.74, 987.65]);
    assert.ok(!JSON.stringify(homeData).includes('must-not-publish'));
    const detail = await person({ ...args('/official/legacy-person'), params: { slug: 'legacy-person' } });
    assert.deepEqual(detail.legacy?.saln_records, legacy.profiles[0].saln_records);
    assert.ok(detail.legacy);
    const metadata = profileMeta({ data: detail });
    assert.ok(metadata.some(tag => 'content' in tag && tag.content?.includes('Original tracker data')));
    await assert.rejects(person({ ...args('/official/short-slug?source=legacy'), params: { slug: 'short-slug' } }), error => error instanceof Response && error.status === 301 && error.headers.get('Location') === '/official/legacy-person?source=legacy');
    await assert.rejects(person({ ...args('/official/canonical-person'), params: { slug: 'canonical-person' } }), error => error instanceof Response && error.status === 301 && error.headers.get('Location') === '/official/legacy-person');
    const render = (child: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, child));
    const listingHtml = render(createElement(LegacyDirectory, { data: legacy }));
    assert.match(listingHtml, /Original tracker data/);
    assert.doesNotMatch(listingHtml, /awaiting review/);
    assert.match(listingHtml, /₱1,375,378,062\.74/);
    assert.match(listingHtml, /₱987\.65/);
    assert.match(listingHtml, /href="\/official\/legacy-person"/);
    assert.doesNotMatch(listingHtml, /href="\/official\/short-slug"/);
    assert.doesNotMatch(listingHtml, /Totals not transcribed|Old capture/);
    assert.equal((listingHtml.match(/No SALN entries recorded/g) ?? []).length, 3);
    for (const id of ['without-records', 'opaque-records', 'null-records']) {
      const detail = await person({ ...args(`/official/${id}`), params: { slug: id } });
      assert.ok(detail.legacy);
      assert.equal(detail.legacy.id, id);
      assert.deepEqual(detail.legacy.saln_records, []);
    }
    const detailHtml = render(createElement(LegacyPersonProfile, { profile: detail.legacy, reviewedSlug: null }));
    assert.equal((detailHtml.match(/id="legacy-entry-/g) ?? []).length, 2);
    assert.match(detailHtml, /Recorded item/);
    assert.match(detailHtml, /href="https:\/\/example\.org\/source\.pdf"/);
    assert.match(detailHtml, /Not recorded/);
    assert.doesNotMatch(detailHtml, /href="javascript:|must-not-publish/);
    for (const source of ['/saln/legacy.pdf', '/saln/legacy copy.pdf#page=2']) {
      const html = render(createElement(LegacyPersonProfile, { profile: { ...detail.legacy, saln_records: [{ ...detail.legacy.saln_records[0], source_url: source }] }, reviewedSlug: null }));
      assert.ok(html.includes(`href="${source}"`), 'Root-relative copies must remain clickable');
    }
    for (const source of ['//outside.example/source.pdf', '/\\outside.example/source.pdf', '/\n/outside.example/source.pdf', 'javascript:alert(1)', 'data:text/html,hello', 'https://user:password@example.org/source.pdf']) {
      const html = render(createElement(LegacyPersonProfile, { profile: { ...detail.legacy, saln_records: [{ ...detail.legacy.saln_records[0], source_url: source }] }, reviewedSlug: null }));
      assert.doesNotMatch(html, /Open legacy source/, 'Unsafe source references must remain plain text');
    }
    const reviewed = await person({ ...args('/official/canonical-person?view=reviewed'), params: { slug: 'canonical-person' } });
    assert.equal(reviewed.person?.person.eligibility, 'unverified');
    assert.deepEqual(reviewed.person?.financialSummaries, []);
    assert.equal((await exportPublicSnapshot(db)).snapshotJson, before.snapshotJson);
  } finally {
    await closeArchive(); client.close();
    for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(directory, { recursive: true, force: true });
  }
});

test('legacy totals and items format fractional-cent and large finite amounts', () => {
  const render = (child: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, child));
  for (const [value, expected] of [[1.005, '₱1.01'], [-1.005, '-₱1.01'], [1e21, '₱1,000,000,000,000,000,000,000.00']] as const) {
    const profile = {
      id: 'currency-fixture', slug: 'currency-fixture', name: 'Currency fixture', position: null, agency: null,
      status: null, term_start: null, term_end: null,
      saln_records: [{ year: 2024, total_assets: value, total_liabilities: value, net_worth: value,
        date_filed: null, status: null, source_url: null, source_description: null,
        assets: [{ description: 'Asset', value, source: null }], liabilities: [{ creditor: 'Creditor', nature: 'Liability', balance: value }],
      }],
    };
    const detail = render(createElement(LegacyPersonProfile, { profile, reviewedSlug: null }));
    assert.equal(detail.split(expected).length - 1, 5, 'All totals and item amounts use the expected currency text');
    const listing = render(createElement(LegacyDirectory, { data: { capturedAt: '2026-11-07T00:00:00.000Z', profiles: [profile] } }));
    assert.equal(listing.split(expected).length - 1, 3, 'Directory totals use the same currency text');
  }
});
