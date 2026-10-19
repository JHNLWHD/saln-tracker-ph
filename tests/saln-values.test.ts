import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { closeArchive } from '../app/archive/archive.server';
import { canonicalJson } from '../app/db/canonical';
import { connectArchive } from '../app/db/client.server';
import type { LegacyProfile, LegacyRecord } from '../app/db/legacy.server';
import Home, { loader as loadHome } from '../app/routes/home';
import Person, { loader as loadPerson } from '../app/routes/official.$slug';
import { sha256, typedFirestoreValue } from '../scripts/legacy-capture';
import { prepareLegacyCopy } from '../scripts/legacy-copy';
import { migrateArchive } from '../scripts/migrate';
import baseline from './fixtures/legacy-public-2026-10-18.json';

const publicProfiles: LegacyProfile[] = baseline.profiles;

// Independent oracle: do not import the application's amount formatter or labels.
const pesos = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const expectedAmount = (value: number | null) => value === null ? 'Not recorded' : pesos.format(value);
const expectedTotals = (record: LegacyRecord) => ({
  'Declared net worth': expectedAmount(record.net_worth),
  'Total assets': expectedAmount(record.total_assets),
  'Total liabilities': expectedAmount(record.total_liabilities),
});

// Read the rendered semantic elements; CSS classes and layout wrappers may change.
const elements = (html: string, tag: string) => [...html.matchAll(new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>`, 'g'))].map(match => ({ attributes: match[1], body: match[2] }));
function text(html: string): string {
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'", '#39': "'" };
  return html.replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|#x27|#39);/g, (_, entity: string) => entities[entity]).trim();
}
const attribute = (attributes: string, name: string) => text(attributes.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1] ?? '');
function totals(html: string) {
  return elements(html, 'dl').map(list => {
    const labels = elements(list.body, 'dt').map(row => text(row.body));
    const values = elements(list.body, 'dd').map(row => text(row.body));
    assert.equal(labels.length, 3, 'Each summary must have three labeled amounts');
    assert.equal(values.length, 3, 'Each summary must have three labeled amounts');
    return Object.fromEntries(labels.map((label, index) => [label, values[index]]));
  });
}
const render = (location: string, child: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(StaticRouter, { location }, child));
const rootMatch = { id: 'root' as const, params: {}, pathname: '/', data: undefined, handle: undefined };

async function withCopiedProfiles(profiles: LegacyProfile[], check: () => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'saln-values-'));
  const url = `file:${join(directory, 'archive.db')}`, { client, db } = connectArchive({ url });
  const prior = { ARCHIVE_ADAPTER: process.env.ARCHIVE_ADAPTER, TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL, TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN };
  try {
    // Feed the real copy command a capture containing only the fixed public fields.
    const documents = profiles.map(({ id, ...data }) => ({ id, path: `officials/${id}`, data: typedFirestoreValue(data) }));
    const rawFiles = [];
    for (const index of [1, 2]) for (const kind of ['typed', 'sdk']) {
      const file = `officials-read-${index}.${kind}.json`;
      const body = JSON.stringify(kind === 'typed' ? { documents } : { synthetic: true });
      await writeFile(join(directory, file), body);
      rawFiles.push({ file, sha256: sha256(body), byteSize: Buffer.byteLength(body) });
    }
    await writeFile(join(directory, 'capture.json'), JSON.stringify({
      format: 'legacy-capture/v1', projectId: 'saln-tracker-ph', database: '(default)', scope: 'public_reader', writesPerformed: false,
      completeDatabaseDocumentTree: false, startedAt: baseline.capturedAt, finishedAt: baseline.capturedAt, readTime: null,
      documentCount: documents.length, dataSha256: sha256(canonicalJson(documents)), rawFiles,
    }));
    await migrateArchive(db);
    await client.batch((await prepareLegacyCopy(directory)).statements, 'write');
    Object.assign(process.env, { ARCHIVE_ADAPTER: 'turso', TURSO_DATABASE_URL: url });
    delete process.env.TURSO_AUTH_TOKEN;
    await check();
  } finally {
    await closeArchive(); client.close();
    for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(directory, { recursive: true, force: true });
  }
}

async function checkPages(profiles: LegacyProfile[]) {
  const homeData = await loadHome({ request: new Request('http://localhost/'), params: {}, context: {} });
  assert.deepEqual(homeData.legacy?.profiles, profiles, 'Home must preserve every public Firebase field and entry');
  const homeHtml = render('/', createElement(Home, { loaderData: homeData, params: {}, matches: [rootMatch, { id: 'routes/home', params: {}, pathname: '/', data: homeData, handle: undefined }] }));
  const cards = elements(homeHtml, 'article');
  assert.equal(cards.length, profiles.length, 'Home must show every profile exactly once');
  assert.ok(text(homeHtml).includes(`${profiles.length} profiles · ${profiles.reduce((n, profile) => n + profile.saln_records.length, 0)} SALN entries`));
  for (const profile of profiles) {
    const path = `/official/${encodeURIComponent(profile.id)}`;
    const matchingCards = cards.filter(card => attribute(card.attributes, 'aria-label') === profile.name);
    assert.equal(matchingCards.length, 1, `${profile.id}: one Home card`);
    const card = matchingCards[0].body;
    const heading = elements(card, 'h3');
    assert.deepEqual(heading.map(row => text(row.body)), [profile.name], `${profile.id}: Home name`);
    assert.equal(attribute(elements(heading[0].body, 'a')[0].attributes, 'href'), path, `${profile.id}: Home profile link`);
    const latestYear = Math.max(...profile.saln_records.map(record => record.year));
    const latest = profile.saln_records.filter(record => record.year === latestYear);
    assert.deepEqual(elements(card, 'p').map(row => text(row.body)).filter(value => /^\d{4}( · Entry \d+)?$/.test(value)), latest.map((record, index) => `${record.year}${latest.length > 1 ? ` · Entry ${index + 1}` : ''}`), `${profile.id}: Home years and distinct entries`);
    assert.deepEqual(totals(card), latest.map(expectedTotals), `${profile.id}: Home totals by label`);

    const params = { slug: profile.id };
    const data = await loadPerson({ request: new Request(`http://localhost${path}`), params, context: {} });
    assert.deepEqual(data.legacy, profile, `${profile.id}: profile loader must preserve every public field`);
    const html = render(path, createElement(Person, { loaderData: data, params, matches: [rootMatch, { id: 'routes/official.$slug', params, pathname: path, data, handle: undefined }] }));
    assert.deepEqual(elements(html, 'h1').map(row => text(row.body)), [profile.name], `${profile.id}: profile name`);
    const entries = elements(html, 'section');
    const ordered = profile.saln_records.map((record, index) => ({ record, index })).sort((a, b) => b.record.year - a.record.year);
    assert.deepEqual(entries.map(entry => attribute(entry.attributes, 'id')), ordered.map(({ index }) => `legacy-entry-${index + 1}`), `${profile.id}: all entries in year order, with stable distinct links`);
    for (const [position, { record, index }] of ordered.entries()) {
      const entry = entries[position].body, label = `${profile.id}, entry ${index + 1}, ${record.year}`;
      assert.deepEqual(elements(entry, 'h2').map(row => text(row.body)), [`${record.year} SALN entry`], `${label}: year`);
      assert.deepEqual(totals(entry), [expectedTotals(record)], `${label}: totals by label`);
      const paragraphs = elements(entry, 'p').map(row => text(row.body));
      assert.ok(paragraphs.includes(`Filing date: ${record.date_filed || 'Not recorded'} · Recorded status: ${record.status || 'Not recorded'}`), `${label}: filing details`);
      assert.deepEqual(elements(entry, 'a').map(link => [text(link.body), attribute(link.attributes, 'href')]), record.source_url ? [['View source', record.source_url]] : [], `${label}: source link`);
      if (record.source_url) {
        assert.ok(paragraphs.includes(record.source_url), `${label}: source reference`);
        assert.ok(paragraphs.includes(record.source_description || 'No source description recorded'), `${label}: source description`);
      } else assert.ok(paragraphs.includes('No source link recorded.'), `${label}: missing source`);
      const tables = elements(entry, 'table').map(table => ({
        caption: elements(table.body, 'caption').map(row => text(row.body)),
        headings: elements(table.body, 'th').map(row => text(row.body)),
        rows: elements(table.body, 'tr').map(row => elements(row.body, 'td').map(cell => text(cell.body))).filter(row => row.length),
      }));
      const expected = [];
      if (record.assets.length) expected.push({ caption: ['Assets'], headings: ['Description', 'Value', 'Source note'], rows: record.assets.map(item => [item.description || 'Not recorded', expectedAmount(item.value), item.source || 'Not recorded']) });
      if (record.liabilities.length) expected.push({ caption: ['Liabilities'], headings: ['Creditor', 'Nature', 'Balance'], rows: record.liabilities.map(item => [item.creditor || 'Not recorded', item.nature || 'Not recorded', expectedAmount(item.balance)]) });
      assert.deepEqual(tables, expected, `${label}: each amount must stay with its item and column`);
      assert.deepEqual(elements(entry, 'summary').map(row => text(row.body)), [`Recorded items · ${record.assets.length} assets · ${record.liabilities.length} liabilities`], `${label}: item counts`);
    }
  }
}

test('all 49 Firebase profiles and 129 SALN entries retain their exact values through SQL copy and rendered Home/profile pages', async () => {
  assert.equal(publicProfiles.length, 49, 'Do not silently shrink the captured baseline');
  const records = publicProfiles.flatMap(profile => profile.saln_records);
  assert.equal(records.length, 129);
  assert.equal(records.flatMap(record => record.assets).length, 129);
  assert.equal(records.flatMap(record => record.liabilities).length, 113);
  assert.equal(records.filter(record => record.source_url).length, 129);
  await withCopiedProfiles(publicProfiles, () => checkPages(publicProfiles));
});

test('distinct same-year entries preserve cents, zero, missing and negative amounts without recalculating declared totals', async () => {
  const record: LegacyRecord = { year: 2024, total_assets: 1234.56, total_liabilities: 0, net_worth: 987.65, date_filed: null, status: null, source_url: '/saln/test.pdf', source_description: 'Test source & note', assets: [{ description: 'First item', value: 1234.56, source: 'A & B' }, { description: 'Unknown value', value: null, source: null }], liabilities: [{ creditor: 'Test creditor', nature: 'Unknown balance', balance: null }] };
  const profiles: LegacyProfile[] = [{ id: 'test-person', slug: 'test-person', name: "Test O'Name", position: null, agency: null, status: null, term_start: null, term_end: null, saln_records: [
    record,
    { ...record, total_assets: null, total_liabilities: null, net_worth: -12.34, source_url: null, assets: [], liabilities: [{ creditor: null, nature: null, balance: 0 }] },
    { ...record, year: 2023, total_assets: 0, total_liabilities: null, net_worth: null, assets: [{ description: 'Zero value', value: 0, source: null }], liabilities: [] },
  ] }];
  await withCopiedProfiles(profiles, () => checkPages(profiles));
});
