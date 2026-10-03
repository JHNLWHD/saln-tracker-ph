import assert from 'node:assert/strict';
import test from 'node:test';
import { getArchive } from '../app/archive/archive.server';

test('redesigned routes require Turso configuration instead of silently serving an empty Firebase Archive', async () => {
  const previous = { ARCHIVE_ADAPTER: process.env.ARCHIVE_ADAPTER, TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL };
  try {
    delete process.env.ARCHIVE_ADAPTER; delete process.env.TURSO_DATABASE_URL;
    await assert.rejects(getArchive(), /TURSO_DATABASE_URL is required/);
    process.env.ARCHIVE_ADAPTER = 'firebase';
    await assert.rejects(getArchive(), /Unknown Archive adapter: firebase/);
    process.env.ARCHIVE_ADAPTER = 'local';
    assert.deepEqual(await (await getArchive()).readHome(), { rosters: [], recentlyAdded: [] });
  } finally {
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
