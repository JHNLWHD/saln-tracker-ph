import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectArchive } from '../app/db/client.server';
import { createDbArchive, importReviewedPerson } from '../app/db/people.server';
import type { ReviewedFiling } from '../app/db/filing-validation';
import { createLocalDocumentStorage } from '../app/storage/objects.server';

test('import CLIs reject migration rollback flags without publishing, while migration rollback remains available', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'saln-cli-options-'));
  const url = `file:${join(directory, 'archive.db')}`;
  const objects = join(directory, 'objects');
  const env = { ...process.env, TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: '', ARCHIVE_STORAGE: 'local', ARCHIVE_OBJECT_DIR: objects };
  const run = (script: string, args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', script, ...args], { env, encoding: 'utf8' });
  const { client, db } = connectArchive({ url });
  try {
    const migration = run('scripts/migrate.ts', ['--environment', 'local']);
    assert.equal(migration.status, 0, migration.stderr);
    const person = JSON.parse(await readFile(new URL('../data/reviewed/0001-ferdinand-marcos-jr.json', import.meta.url), 'utf8'));
    await importReviewedPerson(db, person);
    const archive = createDbArchive(db);
    const before = await archive.listPeople();
    const bytes = Buffer.from('%PDF-1.7\nSynthetic CLI fixture only.\n%%EOF\n');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const manifest: ReviewedFiling = {
      review: { reviewedAt: '2026-09-26', reviewedBy: 'Synthetic CLI test' },
      filing: { id: 'cli-filing', personId: person.person.id, filerName: 'SYNTHETIC TEST ONLY', reportingDate: { value: '2024', precision: 'year' }, executionDate: null, receiptDate: null, supersedesFilingId: null },
      document: {
        id: 'cli-document', filingId: 'cli-filing', fileName: 'synthetic.pdf', mediaType: 'application/pdf', byteSize: bytes.byteLength, sha256,
        originalUrl: 'https://example.org/synthetic.pdf', provenanceType: 'official_download', provenanceNote: 'Synthetic test provenance, not public evidence.',
        officialReleaseDate: null, acquisitionDate: { value: '2026-09-26', precision: 'day' }, archivePublicationDate: '2026-09-26T01:23:45.000Z', transcriptionLevel: 'document_only',
      },
    };
    const manifestPath = join(directory, 'filing.json');
    const documentPath = join(directory, 'synthetic.pdf');
    await writeFile(manifestPath, JSON.stringify(manifest));
    await writeFile(documentPath, bytes);
    for (const [script, args] of [
      ['scripts/import-person.ts', ['data/reviewed/0002-risa-hontiveros.json']],
      ['scripts/import-filing.ts', [manifestPath, documentPath]],
    ] as const) {
      const rejected = run(script, [...args, '--down', '--environment', 'local']);
      assert.equal(rejected.status, 1, `${script} must reject --down`);
      assert.deepEqual(await archive.listPeople(), before);
      assert.equal(await createLocalDocumentStorage(objects).get(sha256), null);
    }
    const imported = run('scripts/import-filing.ts', [manifestPath, documentPath, '--environment', 'local']);
    assert.equal(imported.status, 0, imported.stderr);
    assert.equal((await archive.findPersonBySlug(person.person.slug))?.filings.length, 1);
    assert.deepEqual(await createLocalDocumentStorage(objects).get(sha256), bytes);
    const rollback = run('scripts/migrate.ts', ['--environment', 'local', '--down']);
    assert.equal(rollback.status, 0, rollback.stderr);
    assert.deepEqual((await client.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%'")).rows, []);
  } finally {
    client.close();
    await rm(directory, { recursive: true, force: true });
  }
});
