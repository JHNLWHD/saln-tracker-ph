import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assertIndefiniteLock, assertProductionApproval, assertProductionCheckout, databaseFingerprint, productionBuckets, productionDatabase, verifySqlRecovery } from '../scripts/verify-recovery';
import { connectArchive } from '../app/db/client.server';
import { importReviewedPerson } from '../app/db/people.server';
import { exportPublicSnapshot } from '../app/archive/snapshot.server';
import { migrateArchive } from '../scripts/migrate';

test('production evidence requires exact approval and whole-bucket indefinite locks', () => {
  const lock = { success: true, result: { rules: [{ enabled: true, condition: { type: 'Indefinite' } }] } };
  assert.doesNotThrow(() => assertIndefiniteLock(lock));
  for (const rule of [{ enabled: false, condition: { type: 'Indefinite' } }, { enabled: true, prefix: 'documents/', condition: { type: 'Indefinite' } }, { enabled: true, condition: { type: 'Age', maxAgeSeconds: 9999999 } }]) assert.throws(() => assertIndefiniteLock({ success: true, result: { rules: [rule] } }));
  assert.throws(() => assertIndefiniteLock({ success: false }));
  const revision = 'a'.repeat(40), record = { acceptedCommit: revision, developAcceptanceRef: 'Synthetic acceptance', productionApprovalRef: 'Synthetic explicit approval', rollbackUntil: new Date(Date.now() + 3600000).toISOString() };
  assert.doesNotThrow(() => assertProductionApproval(record, revision));
  for (const changed of [{ acceptedCommit: 'b'.repeat(40) }, { productionApprovalRef: 'pending' }, { developAcceptanceRef: '' }, { rollbackUntil: '2020-01-01' }]) assert.throws(() => assertProductionApproval({ ...record, ...changed }, revision));
});

test('R2 recovery targets must match the independently accepted production inventory', () => {
  const approved = { accountId: 'a'.repeat(32), documentBucket: 'production-documents', backupBucket: 'production-backups' };
  assert.deepEqual(productionBuckets(approved, approved, {}), approved);
  for (const inventory of [null, undefined]) assert.throws(() => productionBuckets(approved, inventory, {}), /accepted release plan/);
  for (const changed of [{ accountId: 'b'.repeat(32) }, { documentBucket: 'staging-documents' }, { backupBucket: 'test-backups' }]) {
    assert.throws(() => productionBuckets({ ...approved, ...changed }, approved, {}), /accepted release plan/);
  }
  for (const bucket of [approved.documentBucket, approved.backupBucket]) assert.throws(() => productionBuckets(approved, approved, { STAGING_R2_BUCKET: bucket }), /staging bucket/);
  const shared = { ...approved, backupBucket: approved.documentBucket };
  assert.throws(() => productionBuckets(shared, shared, {}), /separate production buckets/);
});

test('SQL recovery restores exact bound bytes and rejects corruption and external database attachment', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'saln-sql-test-')), file = join(directory, 'backup.sql');
  try {
    const sql = 'CREATE TABLE recovered (id text PRIMARY KEY); INSERT INTO recovered VALUES (\'synthetic\');';
    const checksum = createHash('sha256').update(sql).digest('hex'); await writeFile(file, sql);
    const restored = await verifySqlRecovery(file, checksum, null);
    assert.equal(restored.restored, true); assert.equal(restored.byteSize, Buffer.byteLength(sql)); assert.match(restored.databaseDigest, /^[a-f0-9]{64}$/);
    await assert.rejects(verifySqlRecovery(file, '0'.repeat(64), null), /checksum mismatch/);
    const outside = join(directory, 'escaped.db');
    for (const unsafe of [`ATTACH DATABASE '${outside}' AS other;`, `${sql} /* comment */ ATTACH DATABASE '${outside}' AS other; CREATE TABLE other.escape(id);`, `${sql} VACUUM INTO '${outside}';`, `${sql} SELECT "writefile"('${outside}', 'escape');`, `${sql} SELECT readfile('${file}');`, `${sql} SELECT data FROM "fsdir"('${file}');`, `${sql} SELECT data FROM 'fsdir'('${file}');`, `${sql} PRAGMA temp_store_directory='${directory}';`, `BEGIN; ${sql}`, `BEGIN; ${sql} /* interrupted`, `${sql}\n.quit\n`]) {
      await writeFile(file, unsafe);
      await assert.rejects(verifySqlRecovery(file, createHash('sha256').update(unsafe).digest('hex'), null));
      await assert.rejects(access(outside));
    }
    const complete = `PRAGMA foreign_keys=OFF; BEGIN; ${sql} INSERT INTO recovered VALUES ('ATTACH is quoted text'); COMMIT; -- complete`;
    await writeFile(file, complete);
    assert.equal((await verifySqlRecovery(file, createHash('sha256').update(complete).digest('hex'), null)).restored, true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('production verification binds actual checkout and authenticated database state, including non-public rows', async () => {
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.throws(() => assertProductionCheckout('0'.repeat(40)), /Running checkout/);
  if (execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { encoding: 'utf8' }).trim()) assert.throws(() => assertProductionCheckout(revision), /clean checkout/);
  else assert.doesNotThrow(() => assertProductionCheckout(revision));
  const url = 'libsql://production.example.invalid', env = { TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: 'synthetic-read-token' };
  assert.equal(productionDatabase(url, url, env).url, url);
  assert.throws(() => productionDatabase('libsql://staging.example.invalid', url, env));
  assert.throws(() => productionDatabase(url, url, { TURSO_DATABASE_URL: url }));
  for (const approved of [undefined, null, '']) assert.throws(() => productionDatabase(url, approved, env), /accepted release plan/);
  const staging = 'libsql://staging.example.invalid';
  assert.throws(() => productionDatabase(staging, url, { ...env, TURSO_DATABASE_URL: staging }), /accepted release plan/);
  assert.throws(() => productionDatabase(url, url, { ...env, STAGING_TURSO_HOST: 'production.example.invalid' }), /staging database/);
  const dotted = `${staging}.`;
  assert.throws(() => productionDatabase(dotted, dotted, { ...env, TURSO_DATABASE_URL: dotted, STAGING_TURSO_HOST: 'STAGING.EXAMPLE.INVALID' }), /staging database/);
  assert.throws(() => productionDatabase(staging, staging, { ...env, TURSO_DATABASE_URL: staging, STAGING_TURSO_HOST: 'staging.example.invalid.' }), /staging database/);
  const directory = await mkdtemp(join(tmpdir(), 'saln-production-binding-')), file = join(directory, 'backup.sql');
  const { client } = connectArchive({ url: `file:${join(directory, 'production.db')}`, intMode: 'bigint' });
  const sql = "CREATE TABLE private_archive (id INTEGER, raw BLOB); INSERT INTO private_archive VALUES (9007199254740993, X'00ff');";
  try {
    await client.executeMultiple(sql); await writeFile(file, sql);
    const checksum = createHash('sha256').update(sql).digest('hex'), digest = await databaseFingerprint(client);
    assert.equal((await verifySqlRecovery(file, checksum, null, digest)).databaseDigest, digest);
    await client.execute('UPDATE private_archive SET id = 9007199254740994');
    await assert.rejects(verifySqlRecovery(file, checksum, null, await databaseFingerprint(client)), /named production database/);
  } finally { client.close(); await rm(directory, { recursive: true, force: true }); }
});

test('a complete native Archive dump reopens with the accepted public snapshot', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'saln-native-recovery-')), path = join(directory, 'archive.db'), file = join(directory, 'backup.sql');
  const { client, db } = connectArchive({ url: `file:${path}` });
  try {
    await migrateArchive(db);
    await importReviewedPerson(db, JSON.parse(await readFile(new URL('../data/reviewed/0001-ferdinand-marcos-jr.json', import.meta.url), 'utf8')));
    const expected = (await exportPublicSnapshot(db)).snapshot.version;
    const dump = execFileSync('sqlite3', ['-init', '/dev/null', path, '.dump']);
    await writeFile(file, dump);
    const production = connectArchive({ url: `file:${path}`, intMode: 'bigint' });
    let digest: string;
    try { digest = await databaseFingerprint(production.client); } finally { production.client.close(); }
    assert.equal((await verifySqlRecovery(file, createHash('sha256').update(dump).digest('hex'), expected, digest)).snapshotVersion, expected);
  } finally { client.close(); await rm(directory, { recursive: true, force: true }); }
});
