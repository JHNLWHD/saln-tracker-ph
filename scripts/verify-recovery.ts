import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Client } from '@libsql/client';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { connectArchive } from '../app/db/client.server';
import { exportPublicSnapshot } from '../app/archive/snapshot.server';
import { canonicalJson } from '../app/db/canonical';

interface LegacyCaptureExpectation { dataSha256: string; documentCount: number; salnCount: number }

function acceptedLegacyCapture(value: unknown): LegacyCaptureExpectation {
  const expected = value as LegacyCaptureExpectation | undefined;
  if (!expected || typeof expected.dataSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expected.dataSha256) || ![expected.documentCount, expected.salnCount].every(count => Number.isSafeInteger(count) && count >= 0)) throw new Error('An accepted legacy capture checksum and counts are required');
  return expected;
}

async function verifyLegacyCapture(client: Client, expected: LegacyCaptureExpectation) {
  // Match the runtime selection. An older complete capture cannot hide a newer partial copy.
  const { rows } = await client.execute('SELECT * FROM legacy_firestore_captures ORDER BY captured_at DESC, data_sha256 DESC LIMIT 1');
  const row = rows[0];
  assert.ok(row, 'The accepted legacy capture is missing');
  assert.equal(row.data_sha256, expected.dataSha256, 'The active legacy capture differs from the accepted release');
  assert.equal(row.project_id, 'saln-tracker-ph'); assert.equal(row.scope, 'public_reader');
  const documents = JSON.parse(String(row.documents_json));
  assert.ok(Array.isArray(documents), 'Expected the complete typed legacy documents');
  assert.equal(createHash('sha256').update(canonicalJson(documents)).digest('hex'), expected.dataSha256, 'Legacy raw data differs from the accepted capture');
  assert.equal(documents.length, expected.documentCount, 'Legacy profile count differs');
  assert.equal(Number(row.document_count), expected.documentCount, 'Legacy stored profile count differs');
  const salnCount = documents.reduce((total, document) => {
    const records = document.data?.fields?.saln_records;
    assert.equal(document.data?.type, 'map'); assert.equal(records?.type, 'array');
    assert.ok(Array.isArray(records.values), 'Expected the preserved SALN array');
    return total + records.values.length;
  }, 0);
  assert.equal(salnCount, expected.salnCount, 'Legacy SALN count differs');
  const capture = JSON.parse(String(row.capture_json));
  assert.equal(capture.dataSha256, expected.dataSha256); assert.equal(capture.documentCount, expected.documentCount);
  assert.equal(capture.projectId, row.project_id); assert.equal(capture.scope, row.scope); assert.equal(capture.finishedAt, row.captured_at);
  return { dataSha256: expected.dataSha256, documentCount: documents.length, salnCount };
}

export function assertIndefiniteLock(input: unknown) {
  const response = input as { success?: boolean; result?: { rules?: { enabled?: boolean; prefix?: string; condition?: { type?: string } }[] } };
  if (response?.success !== true || !Array.isArray(response.result?.rules) || !response.result.rules.some(rule => rule.enabled === true && !rule.prefix && rule.condition?.type === 'Indefinite')) throw new Error('An enabled indefinite lock for the whole bucket is required');
}

export async function databaseFingerprint(client: Client) {
  const tx = await client.transaction('read');
  const encode = (value: unknown) => JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? { integer: String(item) } : item instanceof ArrayBuffer ? { blob: Buffer.from(item).toString('hex') } : item);
  try {
    const schema = await tx.execute("SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name");
    const tables = schema.rows.filter(row => row.type === 'table');
    // A newly provisioned database is a valid, checksum-bound pre-import state.
    const hash = createHash('sha256').update(encode(schema.rows.map(row => Array.from(row))));
    // ponytail: sort one table in memory; use a streaming ordered export if backup tables outgrow operator memory.
    for (const table of tables) {
      const rows = await tx.execute(`SELECT * FROM "${String(table.name).replaceAll('"', '""')}"`);
      hash.update(encode([table.name, rows.columns, rows.rows.map(row => encode(Array.from(row))).sort()]));
    }
    return hash.digest('hex');
  } finally { await tx.rollback(); tx.close(); }
}

function usesFilesystemModule(sql: string) {
  const tokens = (sql.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|--[^\r\n]*|\/\*[\s\S]*?\*\/|[A-Za-z_][A-Za-z_0-9$]*|[^\s]/g) ?? []).filter(token => !token.startsWith('--') && !token.startsWith('/*'));
  const fromClause = [false];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i], name = /^["'`\[]/.test(token) ? token.slice(1, -1) : token;
    // SQLite also accepts single-quoted table/function names. Keep those distinct
    // from string values, including values whose entire text is a module name.
    if (/^(?:fsdir|zipfile)$/i.test(name) && (token[0] !== "'" || tokens[i + 1] === '(' || /^(?:from|join|using|\.)$/i.test(tokens[i - 1] ?? '') || tokens[i - 1] === ',' && fromClause.at(-1))) return true;
    if (token === '(') fromClause.push(false);
    else if (token === ')') { if (fromClause.length > 1) fromClause.pop(); }
    else if (/^from$/i.test(token)) fromClause[fromClause.length - 1] = true;
    else if (/^(?:where|group|having|order|limit|union|intersect|except|returning|;)$/i.test(token)) fromClause[fromClause.length - 1] = false;
  }
  return false;
}

/** Restore only a checksum-bound SQL artifact into a fresh temporary local database. */
export async function verifySqlRecovery(file: string, checksum: string, expectedSnapshot: string | null, expectedDatabase?: string, expectedLegacy?: unknown) {
  const legacy = expectedSnapshot ? acceptedLegacyCapture(expectedLegacy) : undefined;
  if (!/^[a-f0-9]{64}$/.test(checksum)) throw new Error('A backup checksum is required');
  const bytes = await readFile(file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), checksum, 'Backup checksum mismatch');
  const sql = bytes.toString('utf8');
  // Safe mode blocks external writes. Also exclude filesystem scans and non-dump PRAGMAs.
  const commands = sql.replace(/'(?:''|[^'])*'|--[^\r\n]*|\/\*[\s\S]*?\*\//g, ' ');
  const unsafePragmas = commands.replace(/\bPRAGMA\s+foreign_keys\s*=\s*(?:OFF|ON|0|1)\s*;/gi, '');
  if (!commands.trim() || sql.includes('\0') || usesFilesystemModule(sql) || /\bPRAGMA\b/i.test(unsafePragmas)) throw new Error('Expected a complete, self-contained SQL dump without filesystem modules');
  const directory = await mkdtemp(join(tmpdir(), 'saln-recovery-')), config = { url: `file:${join(directory, 'restore.db')}`, intMode: 'bigint' as const };
  let connection: ReturnType<typeof connectArchive> | undefined;
  try {
    const sentinel = randomUUID(), init = join(directory, 'empty-init.sql');
    await writeFile(init, '');
    let output: string;
    try {
      const version = execFileSync('sqlite3', ['-version'], { encoding: 'utf8', timeout: 10_000 }).match(/^(\d+)\.(\d+)\.(\d+)/);
      if (!version || Number(version[1]) * 1_000_000 + Number(version[2]) * 1_000 + Number(version[3]) < 3_040_001) throw new Error('SQLite 3.40.1 or newer is required');
      // A second BEGIN rejects an open transaction; the random sentinel rejects early .quit and incomplete SQL/comments.
      output = execFileSync('sqlite3', ['-safe', '-batch', '-bail', '-init', init, join(directory, 'restore.db')], {
        input: `${sql}\n;\nBEGIN; ROLLBACK;\n.print ${sentinel}\n`, encoding: 'utf8', cwd: directory,
        env: { ...process.env, SQLITE_TMPDIR: directory }, timeout: 60_000, stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch { throw new Error('Safe SQL restore failed; a complete dump and sqlite3 CLI 3.40.1 or newer with safe mode are required'); }
    assert.equal(output.trim().split(/\r?\n/).at(-1), sentinel, 'SQL restore did not complete');
    connection = connectArchive(config);
    const { client } = connection;
    const integrity = await client.execute('PRAGMA integrity_check');
    assert.deepEqual(integrity.rows.map(row => Object.values(row)[0]), ['ok']);
    const databaseDigest = await databaseFingerprint(client);
    if (expectedDatabase) assert.equal(databaseDigest, expectedDatabase, 'Backup differs from the named production database');
    let legacyCapture: LegacyCaptureExpectation | undefined;
    if (expectedSnapshot) {
      client.close();
      connection = connectArchive({ url: config.url });
      assert.equal((await exportPublicSnapshot(connection.db)).snapshot.version, expectedSnapshot, 'Restored public snapshot differs from the accepted release');
      legacyCapture = await verifyLegacyCapture(connection.client, legacy!);
    }
    return { sha256: checksum, byteSize: bytes.byteLength, restored: true, snapshotVersion: expectedSnapshot, databaseDigest, legacyCapture };
  } finally { connection?.client.close(); await rm(directory, { recursive: true, force: true }); }
}

export function assertProductionCheckout(revision: string, directory = fileURLToPath(new URL('../', import.meta.url))) {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();
  assert.equal(git('rev-parse', 'HEAD'), revision, 'Running checkout differs from the accepted commit');
  assert.equal(git('status', '--porcelain', '--untracked-files=normal'), '', 'Production verification requires a clean checkout');
}

export function productionDatabase(url: unknown, approvedUrl: unknown, stagingHost: unknown, env: NodeJS.ProcessEnv = process.env) {
  if (typeof approvedUrl !== 'string' || !approvedUrl.trim() || url !== approvedUrl) throw new Error('Production Turso target must match the accepted release plan');
  if (typeof url !== 'string' || url !== env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) throw new Error('Named production Turso target and read-only credentials are required');
  const parsed = new URL(url);
  if (!['libsql:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== '/')) throw new Error('Expected a credential-free production Turso URL');
  const hostname = (value: string) => value.toLowerCase().replace(/\.$/, '');
  if (typeof stagingHost !== 'string' || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.?$/i.test(stagingHost)) throw new Error('A staging database hostname from the accepted release plan is required');
  if (hostname(parsed.hostname) === hostname(stagingHost)) throw new Error('The staging database cannot be a production recovery target');
  return { url, authToken: env.TURSO_AUTH_TOKEN, intMode: 'bigint' as const };
}

interface ProductionBuckets { accountId: string; documentBucket: string; documentJurisdiction: string; backupBucket: string; backupJurisdiction: string }
interface StagingBucket { accountId: string; bucket: string; jurisdiction: string }
export function productionBuckets(targets: ProductionBuckets, approved: ProductionBuckets | null | undefined, staging: StagingBucket | null | undefined) {
  if (!approved || !['accountId', 'documentBucket', 'documentJurisdiction', 'backupBucket', 'backupJurisdiction'].every(key => Reflect.get(targets, key) === Reflect.get(approved, key))) throw new Error('Production R2 targets must match the accepted release plan');
  const { accountId, documentBucket, documentJurisdiction, backupBucket, backupJurisdiction } = targets;
  if (typeof accountId !== 'string' || !/^[a-f0-9]{32}$/.test(accountId) || documentBucket === backupBucket && documentJurisdiction === backupJurisdiction || ![documentBucket, backupBucket].every(bucket => typeof bucket === 'string' && /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket))) throw new Error('Named separate production buckets are required');
  if (![documentJurisdiction, backupJurisdiction].every(value => ['default', 'eu', 'us', 'fedramp'].includes(value))) throw new Error('Each production bucket requires an explicit supported jurisdiction');
  const endpoint = (jurisdiction: string) => `https://${accountId}${jurisdiction === 'default' ? '' : `.${jurisdiction}`}.r2.cloudflarestorage.com`;
  if (!staging || typeof staging.accountId !== 'string' || !/^[a-f0-9]{32}$/.test(staging.accountId) || typeof staging.bucket !== 'string' || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(staging.bucket) || !['default', 'eu', 'us', 'fedramp'].includes(staging.jurisdiction)) throw new Error('A staging R2 identity from the accepted release plan is required');
  for (const [bucket, jurisdiction] of [[documentBucket, documentJurisdiction], [backupBucket, backupJurisdiction]]) {
    if (bucket === staging.bucket && accountId === staging.accountId && jurisdiction === staging.jurisdiction) throw new Error('The staging bucket cannot be a production recovery target');
  }
  return { accountId, documentBucket, documentJurisdiction, backupBucket, backupJurisdiction,
    backupEndpoint: endpoint(backupJurisdiction) };
}

export async function verifyBucketLocks(targets: ProductionBuckets, token: string) {
  for (const [bucket, jurisdiction] of [[targets.documentBucket, targets.documentJurisdiction], [targets.backupBucket, targets.backupJurisdiction]]) {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${targets.accountId}/r2/buckets/${bucket}/lock`, { headers: { Authorization: `Bearer ${token}`, 'cf-r2-jurisdiction': jurisdiction }, signal: AbortSignal.timeout(30000), redirect: 'error' });
    if (!response.ok) throw new Error('Bucket lock lookup failed');
    assertIndefiniteLock(await response.json());
  }
}

export function assertProductionApproval(record: { acceptedCommit?: string; developAcceptanceRef?: string; productionApprovalRef?: string; rollbackUntil?: string }, revision: string) {
  if (!/^[a-f0-9]{40}$/.test(revision) || record.acceptedCommit !== revision) throw new Error('Approval must identify the exact accepted commit');
  for (const ref of [record.developAcceptanceRef, record.productionApprovalRef]) if (!ref?.trim() || /^(?:pending|unapproved|example)$/i.test(ref.trim())) throw new Error('Develop acceptance and explicit production approval references are required');
  const deadline = Date.parse(record.rollbackUntil ?? '');
  if (!Number.isFinite(deadline) || deadline <= Date.now()) throw new Error('An agreed future rollback deadline is required');
}

export function assertRecoverySnapshot(actual: unknown, expected: unknown) {
  if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected) || actual !== expected) throw new Error('Recovery snapshot must match the accepted release plan');
}

/** Bind post-import checks to the successful, retained pre-import verification. */
export async function readBeforeRecovery(file: string, binding: {
  acceptedCommit: string; databaseUrl: string;
  backupTarget: { accountId: string; bucket: string; jurisdiction: string };
  pre: { key: string; sha256: string };
}) {
  const before = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(before.status, 'recovery_evidence_checked_not_deployed');
  assert.equal(before.phase, 'before');
  assert.equal(before.acceptedCommit, binding.acceptedCommit);
  assert.equal(before.databaseUrl, binding.databaseUrl);
  assert.deepEqual(before.backupTarget, binding.backupTarget);
  assert.ok(Array.isArray(before.verified) && before.verified.length === 1, 'Expected one verified pre-import backup');
  const pre = before.verified[0];
  assert.equal(pre.phase, 'pre'); assert.equal(pre.key, binding.pre.key); assert.equal(pre.sha256, binding.pre.sha256);
  assert.equal(pre.restored, true); assert.equal(pre.matchesCurrentProduction, true);
  assert.equal(typeof pre.databaseDigest, 'string'); assert.match(pre.databaseDigest, /^[a-f0-9]{64}$/);
  return pre.databaseDigest as string;
}

async function main() {
  const [file, phase, revision, ...extra] = process.argv.slice(2);
  if (!file || !['before', 'after'].includes(phase) || !revision || extra.length) throw new Error('Usage: archive:verify-recovery -- private-cutover-record.json before|after accepted-commit');
  const record = JSON.parse(await readFile(file, 'utf8'));
  assertProductionApproval(record, revision);
  assertProductionCheckout(revision);
  const plan = JSON.parse(await readFile(new URL('../data/release/stage-one.json', import.meta.url), 'utf8'));
  // Recovery checks do not publish Source Documents or promote copied legacy data.
  assertRecoverySnapshot(record.snapshotVersion, plan.expected.snapshotVersion);
  const buckets = productionBuckets(record.targets, plan.productionR2, plan.stagingR2);
  const databaseConfig = productionDatabase(record.targets.tursoDatabaseUrl, plan.productionTursoDatabaseUrl, plan.stagingTursoHost);
  const backupTarget = { accountId: buckets.accountId, bucket: buckets.backupBucket, jurisdiction: buckets.backupJurisdiction };
  const beforeReportFile = `${file}.before.json`;
  const beforeDigest = phase === 'after' ? await readBeforeRecovery(beforeReportFile, { acceptedCommit: revision, databaseUrl: databaseConfig.url, backupTarget, pre: record.backups.pre }) : undefined;
  const token = process.env.R2_CONFIG_READ_TOKEN;
  if (!token || !process.env.BACKUP_R2_ACCESS_KEY_ID || !process.env.BACKUP_R2_SECRET_ACCESS_KEY) throw new Error('Read-only lock and backup credentials are required');
  await verifyBucketLocks(buckets, token);
  const storage = new S3Client({ region: 'auto', endpoint: buckets.backupEndpoint, credentials: { accessKeyId: process.env.BACKUP_R2_ACCESS_KEY_ID, secretAccessKey: process.env.BACKUP_R2_SECRET_ACCESS_KEY }, responseChecksumValidation: 'WHEN_REQUIRED' });
  try {
    const production = connectArchive(databaseConfig);
    let productionDigest: string;
    try { productionDigest = await databaseFingerprint(production.client); } finally { production.client.close(); }
    const verified = [];
    for (const name of phase === 'before' ? ['pre'] : ['pre', 'post']) {
      const backup = record.backups[name];
      if (!backup || typeof backup.key !== 'string' || !backup.key.startsWith(`releases/${revision}/`) || !backup.key.endsWith(`/${name}.sql`)) throw new Error('Backup keys must identify this release and phase');
      const currentPhase = name === (phase === 'before' ? 'pre' : 'post');
      const restored = await verifySqlRecovery(backup.file, backup.sha256, name === 'post' ? record.snapshotVersion : null, currentPhase ? productionDigest : beforeDigest, name === 'post' ? plan.legacyCapture : undefined);
      const object = await storage.send(new GetObjectCommand({ Bucket: buckets.backupBucket, Key: backup.key }));
      if (!object.Body) throw new Error('Locked backup has no body');
      const bytes = await object.Body.transformToByteArray();
      assert.equal(bytes.byteLength, restored.byteSize); assert.equal(createHash('sha256').update(bytes).digest('hex'), backup.sha256);
      verified.push({ phase: name, key: backup.key, ...restored, matchesCurrentProduction: currentPhase });
    }
    const report = { status: 'recovery_evidence_checked_not_deployed', observedAt: new Date().toISOString(), acceptedCommit: revision, databaseUrl: databaseConfig.url, backupTarget, phase, verified };
    if (phase === 'before') await writeFile(beforeReportFile, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify(report));
  } finally { storage.destroy(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('Production recovery gate failed. No deployment, database import or provider write was performed.'); process.exitCode = 1; });
