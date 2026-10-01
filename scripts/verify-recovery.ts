import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { connectArchive } from '../app/db/client.server';
import { exportPublicSnapshot } from '../app/archive/snapshot.server';

export function assertIndefiniteLock(input: unknown) {
  const response = input as { success?: boolean; result?: { rules?: { enabled?: boolean; prefix?: string; condition?: { type?: string } }[] } };
  if (response?.success !== true || !Array.isArray(response.result?.rules) || !response.result.rules.some(rule => rule.enabled === true && !rule.prefix && rule.condition?.type === 'Indefinite')) throw new Error('An enabled indefinite lock for the whole bucket is required');
}

/** Restore only a checksum-bound SQL artifact into a fresh temporary local database. */
export async function verifySqlRecovery(file: string, checksum: string, expectedSnapshot: string | null) {
  if (!/^[a-f0-9]{64}$/.test(checksum)) throw new Error('A backup checksum is required');
  const bytes = await readFile(file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), checksum, 'Backup checksum mismatch');
  const sql = bytes.toString('utf8');
  if (!sql.trim() || /^\s*(?:ATTACH|DETACH)\b/im.test(sql)) throw new Error('Expected a self-contained SQL dump');
  const directory = await mkdtemp(join(tmpdir(), 'saln-recovery-')), { client, db } = connectArchive({ url: `file:${join(directory, 'restore.db')}` });
  try {
    await client.executeMultiple(sql);
    const integrity = await client.execute('PRAGMA integrity_check');
    assert.deepEqual(integrity.rows.map(row => Object.values(row)[0]), ['ok']);
    if (expectedSnapshot) assert.equal((await exportPublicSnapshot(db)).snapshot.version, expectedSnapshot, 'Restored public snapshot differs from the accepted release');
    return { sha256: checksum, byteSize: bytes.byteLength, restored: true, snapshotVersion: expectedSnapshot };
  } finally { client.close(); await rm(directory, { recursive: true, force: true }); }
}

export function assertProductionApproval(record: { acceptedCommit?: string; developAcceptanceRef?: string; productionApprovalRef?: string; rollbackUntil?: string }, revision: string) {
  if (!/^[a-f0-9]{40}$/.test(revision) || record.acceptedCommit !== revision) throw new Error('Approval must identify the exact accepted commit');
  for (const ref of [record.developAcceptanceRef, record.productionApprovalRef]) if (!ref?.trim() || /^(?:pending|unapproved|example)$/i.test(ref.trim())) throw new Error('Develop acceptance and explicit production approval references are required');
  const deadline = Date.parse(record.rollbackUntil ?? '');
  if (!Number.isFinite(deadline) || deadline <= Date.now()) throw new Error('An agreed future rollback deadline is required');
}

async function main() {
  const [file, phase, revision, ...extra] = process.argv.slice(2);
  if (!file || !['before', 'after'].includes(phase) || !revision || extra.length) throw new Error('Usage: archive:verify-recovery -- private-cutover-record.json before|after accepted-commit');
  const record = JSON.parse(await readFile(file, 'utf8'));
  assertProductionApproval(record, revision);
  const plan = JSON.parse(await readFile(new URL('../data/release/stage-one.json', import.meta.url), 'utf8'));
  if (plan.publicationReviewPending.length || record.snapshotVersion !== plan.expected.snapshotVersion) throw new Error('Release publication review must pass before production verification');
  const { accountId, documentBucket, backupBucket } = record.targets;
  if (!/^[a-f0-9]{32}$/.test(accountId) || documentBucket === backupBucket || ![documentBucket, backupBucket].every(bucket => /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket))) throw new Error('Named separate production buckets are required');
  const token = process.env.R2_CONFIG_READ_TOKEN;
  if (!token || !process.env.BACKUP_R2_ACCESS_KEY_ID || !process.env.BACKUP_R2_SECRET_ACCESS_KEY) throw new Error('Read-only lock and backup credentials are required');
  for (const bucket of [documentBucket, backupBucket]) {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/lock`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000), redirect: 'error' });
    if (!response.ok) throw new Error('Bucket lock lookup failed');
    assertIndefiniteLock(await response.json());
  }
  const storage = new S3Client({ region: 'auto', endpoint: `https://${accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId: process.env.BACKUP_R2_ACCESS_KEY_ID, secretAccessKey: process.env.BACKUP_R2_SECRET_ACCESS_KEY }, responseChecksumValidation: 'WHEN_REQUIRED' });
  try {
    const verified = [];
    for (const name of phase === 'before' ? ['pre'] : ['pre', 'post']) {
      const backup = record.backups[name];
      if (!backup || typeof backup.key !== 'string' || !backup.key.startsWith(`releases/${revision}/`) || !backup.key.endsWith(`/${name}.sql`)) throw new Error('Backup keys must identify this release and phase');
      const restored = await verifySqlRecovery(backup.file, backup.sha256, name === 'post' ? record.snapshotVersion : null);
      const object = await storage.send(new GetObjectCommand({ Bucket: backupBucket, Key: backup.key }));
      if (!object.Body) throw new Error('Locked backup has no body');
      const bytes = await object.Body.transformToByteArray();
      assert.equal(bytes.byteLength, restored.byteSize); assert.equal(createHash('sha256').update(bytes).digest('hex'), backup.sha256);
      verified.push({ phase: name, ...restored });
    }
    console.log(JSON.stringify({ status: 'recovery_evidence_checked_not_deployed', acceptedCommit: revision, phase, verified }));
  } finally { storage.destroy(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('Production recovery gate failed. No deployment, database import or provider write was performed.'); process.exitCode = 1; });
