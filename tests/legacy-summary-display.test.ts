import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createLegacyArchive } from '../app/archive/legacy';
import { SALNRecordsView } from '../app/components/SALNRecordsView';

test('summary-only legacy records show unknown metadata without inventing dates or review status', async () => {
  for (const date of [undefined, 'invalid date']) {
    const archive = createLegacyArchive({ async list() { return []; }, async find() { return { id: 'summary-only', data: {
      name: 'Synthetic Person', agency: 'LEGISLATIVE', status: 'active',
      saln_records: [{ year: 2020, net_worth: 10, total_assets: 12, total_liabilities: 2, ...(date ? { date_filed: date } : {}) }],
    } }; } });
    const profile = await archive.readProfile('summary-only'); assert.ok(profile);
    const html = renderToStaticMarkup(createElement(SALNRecordsView, { official: profile.legacyPresentation.officialWithSALN, salnRecords: profile.legacyPresentation.salnRecords }));
    assert.match(html, /Not recorded/); assert.match(html, /Status not recorded/); assert.doesNotMatch(html, /Invalid Date/);
  }
});
