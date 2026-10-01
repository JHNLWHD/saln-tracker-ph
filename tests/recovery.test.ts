import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assertIndefiniteLock, assertProductionApproval, verifySqlRecovery } from '../scripts/verify-recovery';

test('production evidence requires exact approval and whole-bucket indefinite locks', () => {
  const lock = { success: true, result: { rules: [{ enabled: true, condition: { type: 'Indefinite' } }] } };
  assert.doesNotThrow(() => assertIndefiniteLock(lock));
  for (const rule of [{ enabled: false, condition: { type: 'Indefinite' } }, { enabled: true, prefix: 'documents/', condition: { type: 'Indefinite' } }, { enabled: true, condition: { type: 'Age', maxAgeSeconds: 9999999 } }]) assert.throws(() => assertIndefiniteLock({ success: true, result: { rules: [rule] } }));
  assert.throws(() => assertIndefiniteLock({ success: false }));
  const revision = 'a'.repeat(40), record = { acceptedCommit: revision, developAcceptanceRef: 'Synthetic acceptance', productionApprovalRef: 'Synthetic explicit approval', rollbackUntil: new Date(Date.now() + 3600000).toISOString() };
  assert.doesNotThrow(() => assertProductionApproval(record, revision));
  for (const changed of [{ acceptedCommit: 'b'.repeat(40) }, { productionApprovalRef: 'pending' }, { developAcceptanceRef: '' }, { rollbackUntil: '2020-01-01' }]) assert.throws(() => assertProductionApproval({ ...record, ...changed }, revision));
});

test('SQL recovery restores exact bound bytes and rejects corruption and external database attachment', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'saln-sql-test-')), file = join(directory, 'backup.sql');
  try {
    const sql = 'CREATE TABLE recovered (id text PRIMARY KEY); INSERT INTO recovered VALUES (\'synthetic\');';
    const checksum = createHash('sha256').update(sql).digest('hex'); await writeFile(file, sql);
    assert.deepEqual(await verifySqlRecovery(file, checksum, null), { sha256: checksum, byteSize: Buffer.byteLength(sql), restored: true, snapshotVersion: null });
    await assert.rejects(verifySqlRecovery(file, '0'.repeat(64), null), /checksum mismatch/);
    const unsafe = 'ATTACH DATABASE \'another.db\' AS other;'; await writeFile(file, unsafe);
    await assert.rejects(verifySqlRecovery(file, createHash('sha256').update(unsafe).digest('hex'), null), /self-contained/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
