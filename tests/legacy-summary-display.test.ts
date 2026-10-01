import assert from 'node:assert/strict';
import test from 'node:test';
import { createLegacyArchive } from '../app/archive/legacy';
import type { SALNRecord } from '../app/data/officials';

test('legacy records preserve unknown raw metadata through the adapter', async () => {
  for (const [date, status] of [[undefined, undefined], ['invalid date', 'unsupported'], ['2024-02-30', { value: 'verified' }], ['2024-02', 1]]) {
    const record: SALNRecord = { year: 2020, net_worth: 10, total_assets: 12, total_liabilities: 2, assets: [], liabilities: [], date_filed: date, status };
    const archive = createLegacyArchive({ async list() { return []; }, async find() { return { id: 'summary-only', data: {
      name: 'Synthetic Person', agency: 'LEGISLATIVE', status: 'active',
      saln_records: [record],
    } }; } });
    const profile = await archive.readProfile('summary-only'); assert.ok(profile);
    assert.equal(profile.legacyPresentation.salnRecords[0].date_filed, date);
    assert.equal(profile.legacyPresentation.salnRecords[0].status, status);

  }
});

test('a real leap-day filing date keeps its original value and supported status', async () => {
  const archive = createLegacyArchive({ async list() { return []; }, async find() { return { id: 'dated', data: {
    name: 'Synthetic Person', agency: 'LEGISLATIVE', status: 'active',
    saln_records: [{ year: 2024, net_worth: 10, total_assets: 12, total_liabilities: 2, date_filed: '2024-02-29', status: 'submitted' }],
  } }; } });
  const profile = await archive.readProfile('dated'); assert.ok(profile);
  assert.equal(profile.legacyPresentation.salnRecords[0].date_filed, '2024-02-29');
  assert.equal(profile.legacyPresentation.salnRecords[0].status, 'submitted');
});
