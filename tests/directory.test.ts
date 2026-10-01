import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { directoryFilters, directoryHref } from '../app/archive/directory';
import { connectArchive } from '../app/db/client.server';
import { applyReviewedManifest } from '../app/db/manifests.server';
import { createDbArchive } from '../app/db/people.server';
import { migrateArchive } from '../scripts/migrate';

const filters = (query = '') => directoryFilters(new URLSearchParams(query));
test('URL filters reject unsupported fields, repeated values and bad periods; pagination preserves approved filters', () => {
  for (const query of ['amount=100', 'q=x&q=y', 'year=0000', 'page=-1', 'page=1.1', 'tenure=unknown', 'documents=claimed', `q=${'a'.repeat(129)}`]) assert.throws(() => filters(query));
  assert.equal(filters('year=1800').year, '1800');
  assert.equal(directoryHref(filters('q=Risa&documents=available'), 2), '/people?q=Risa&documents=available&page=2');
});

test('native directory searches only public identity/office fields and applies roster, correction and eligibility boundaries', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'saln-directory-')), { client, db } = connectArchive({ url: `file:${join(directory, 'archive.db')}` });
  const root = new URL('../data/reviewed/', import.meta.url);
  async function apply(path: string) { const input = JSON.parse(await readFile(new URL(path, root), 'utf8')); return applyReviewedManifest(db, input.kind ? input : { id: `person:${input.person.id}`, version: 1, kind: 'person', payload: input }); }
  try {
    await migrateArchive(db);
    for (const path of ['0001-ferdinand-marcos-jr.json', '0002-risa-hontiveros.json', '0003-legacy-identities.json', '0004-sara-duterte.json', '0005-executive-roster-2026-09-28.json']) await apply(path);
    for (const folder of ['senate-2022-cohort', 'stage-one-completion']) for (const path of (await readdir(new URL(`${folder}/`, root))).filter(path => path.endsWith('.json')).sort()) await apply(`${folder}/${path}`);
    const archive = createDbArchive(db), browse = (query = '') => archive.browsePeople(filters(query));
    assert.equal((await browse()).total, 27); assert.equal((await browse('tenure=current')).total, 27); assert.equal((await browse('tenure=former')).total, 0);
    assert.equal((await browse('q=Sherwin')).rows[0].slug, 'win-gatchalian'); assert.equal((await browse('q=Isabela')).rows[0].slug, 'faustino-bojie-dy-iii');
    assert.equal((await browse('q=Senator')).total, 24); assert.equal((await browse('office=office-senate-president-ph&tenure=current')).total, 1);
    assert.equal((await browse('jurisdiction=jurisdiction-isabela')).total, 1); assert.equal((await browse('jurisdiction=jurisdiction-ph')).total, 27);
    for (const q of ['%25', '_', '%27+OR+1%3D1--']) assert.equal((await browse(`q=${q}`)).total, 0);
    assert.equal((await browse('page=999')).page, 1); assert.equal((await browse('documents=available')).total, 0);
    const review = { reviewedAt: '2026-10-02', reviewedBy: 'private test reviewer' }, bytes = Buffer.from('%PDF-1.7\nSynthetic directory fixture\n%%EOF\n'), sha256 = createHash('sha256').update(bytes).digest('hex');
    await applyReviewedManifest(db, { id: 'synthetic-filing', version: 1, kind: 'filing', payload: { review, filing: { id: 'synthetic-filing', personId: 'person-risa-hontiveros', filerName: 'FAMILYNAME FIRST', reportingDate: { value: '2024', precision: 'year' }, executionDate: null, receiptDate: null, supersedesFilingId: null }, document: { id: 'synthetic-document', filingId: 'synthetic-filing', fileName: 'unindexed-document-label.pdf', mediaType: 'application/pdf', byteSize: bytes.byteLength, sha256, originalUrl: 'https://example.org/source', provenanceType: 'official_download', provenanceNote: 'unindexed-document-text', officialReleaseDate: null, acquisitionDate: { value: '2026-10-02', precision: 'day' }, archivePublicationDate: '2026-10-02T00:00:00.000Z', transcriptionLevel: 'document_only' } } }, { bytes, storage: { async get() { return bytes; }, async put() { return { created: true, storageKey: `documents/sha256/${sha256}` }; } } });
    await applyReviewedManifest(db, { id: 'synthetic-report', version: 1, kind: 'report', payload: { review, report: { id: 'synthetic-report', personId: 'person-risa-hontiveros', title: 'unindexed-article-prose', url: 'https://example.org/report', publisher: 'Test', publishedDate: null, note: '55555.00' } } });
    assert.equal((await browse('q=FAMILYNAME')).total, 1); assert.equal((await browse('year=2024&documents=available')).total, 1);
    for (const q of ['unindexed-document-label', 'unindexed-document-text', 'unindexed-article-prose', '55555.00']) assert.equal((await browse(`q=${q}`)).total, 0);
    const correction = { id: 'correct-directory-name', version: 1, kind: 'correction', payload: { review, target: { type: 'person', id: 'person-risa-hontiveros' }, previousCorrectionId: null, reason: 'Synthetic approved identity correction', changes: { canonicalName: 'Reviewed Person Name', nameVariants: ['NewAliasUnique'] }, citations: [{ id: 'name-proof', title: 'Synthetic name evidence', url: 'https://example.org/name', publisher: 'Test', type: 'official_record', supports: ['canonicalName', 'nameVariants'], publishedDate: null }] } };
    await applyReviewedManifest(db, correction);
    assert.equal((await browse('q=NewAliasUnique')).rows[0].canonicalName, 'Reviewed Person Name'); assert.equal((await browse('q=Ana+Theresia')).total, 0);
    const boundary = { id: 'actual-end', version: 1, kind: 'correction', payload: { review, target: { type: 'tenure', id: 'tenure-marcos-president-2022' }, previousCorrectionId: null, reason: 'Synthetic actual end review', changes: { endDate: { value: '2024', precision: 'year' } }, citations: [{ id: 'end-proof', title: 'Synthetic actual end', url: 'https://example.org/end', publisher: 'Test', type: 'official_record', supports: ['endDate'], publishedDate: null }] } };
    await applyReviewedManifest(db, boundary);
    assert.equal((await browse('tenure=former')).total, 1); assert.equal((await browse('tenure=current')).total, 26);
    assert.equal((await archive.readHome()).rosters.find(roster => roster.snapshot.scope === 'executive')!.rows.length, 1);
    assert.equal((await archive.findPersonBySlug('ferdinand-marcos-jr'))?.rosterMemberships?.length, 0);
    await applyReviewedManifest(db, { ...boundary, id: 'clear-end', payload: { ...boundary.payload, previousCorrectionId: 'actual-end', changes: { endDate: null } } });
    assert.equal((await browse('tenure=former')).total, 0); assert.equal((await browse('tenure=current')).total, 27);
    await applyReviewedManifest(db, { id: 'dispute-president', version: 1, kind: 'correction', payload: { review, target: { type: 'tenure', id: 'tenure-marcos-president-2022' }, previousCorrectionId: 'clear-end', reason: 'Synthetic eligibility dispute', changes: { verificationStatus: 'disputed', disputedFacts: ['office'] }, citations: [{ id: 'office-dispute-proof', title: 'Synthetic dispute', url: 'https://example.org/dispute', publisher: 'Test', type: 'public_article', supports: ['person', 'office', 'verificationStatus', 'disputedFacts'], publishedDate: null }] } });
    assert.equal((await browse()).total, 26); assert.equal((await browse('q=Ferdinand')).total, 0); assert.equal((await browse('tenure=current')).total, 26);
    const plan = await client.execute({ sql: 'EXPLAIN QUERY PLAN SELECT * FROM tenures WHERE constituency_id = ?', args: ['constituency-isabela-6'] });
    assert.ok(plan.rows.some(row => String(row.detail).includes('tenures_constituency')));
  } finally { client.close(); await rm(directory, { recursive: true, force: true }); }
});
