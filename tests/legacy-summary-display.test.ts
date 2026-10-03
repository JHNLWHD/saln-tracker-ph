import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createLegacyArchive } from '../app/archive/legacy';
import { SALNRecordsView } from '../app/components/SALNRecordsView';

test('summary-only legacy records show unknown metadata without inventing dates or review status', async () => {
  for (const [date, status] of [[undefined, undefined], ['invalid date', 'unsupported'], ['2024-02-30', { value: 'verified' }], ['2024-02', 1]]) {
    const archive = createLegacyArchive({ async list() { return []; }, async find() { return { id: 'summary-only', data: {
      name: 'Synthetic Person', agency: 'LEGISLATIVE', status: 'active',
      saln_records: [{ year: 2020, net_worth: 10, total_assets: 12, total_liabilities: 2, date_filed: date, status }],
    } }; } });
    const profile = await archive.readProfile('summary-only'); assert.ok(profile);
    const html = renderToStaticMarkup(createElement(SALNRecordsView, { official: profile.legacyPresentation.officialWithSALN, salnRecords: profile.legacyPresentation.salnRecords }));
    assert.match(html, /Not recorded/); assert.match(html, /Status not recorded/); assert.doesNotMatch(html, /Invalid Date/);
  }
});

test('a real leap-day Filing date keeps its calendar date and supported status', async () => {
  const archive = createLegacyArchive({ async list() { return []; }, async find() { return { id: 'dated', data: {
    name: 'Synthetic Person', agency: 'LEGISLATIVE', status: 'active',
    saln_records: [{ year: 2024, net_worth: 10, total_assets: 12, total_liabilities: 2, date_filed: '2024-02-29', status: 'submitted' }],
  } }; } });
  const profile = await archive.readProfile('dated'); assert.ok(profile);
  const html = renderToStaticMarkup(createElement(SALNRecordsView, { official: profile.legacyPresentation.officialWithSALN, salnRecords: profile.legacyPresentation.salnRecords }));
  assert.match(html, /February 29, 2024/); assert.match(html, /Submitted/);
});
