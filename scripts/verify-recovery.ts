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
    assert.ok(tables.length, 'Restored database has no application tables');
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
export async function verifySqlRecovery(file: string, checksum: string, expectedSnapshot: string | null, expectedDatabase?: string) {
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
    if (expectedSnapshot) {
      client.close();
      connection = connectArchive({ url: config.url });
      assert.equal((await exportPublicSnapshot(connection.db)).snapshot.version, expectedSnapshot, 'Restored public snapshot differs from the accepted release');
    }
    return { sha256: checksum, byteSize: bytes.byteLength, restored: true, snapshotVersion: expectedSnapshot, databaseDigest };
  } finally { connection?.client.close(); await rm(directory, { recursive: true, force: true }); }
}

export function assertProductionCheckout(revision: string, directory = fileURLToPath(new URL('../', import.meta.url))) {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();
  assert.equal(git('rev-parse', 'HEAD'), revision, 'Running checkout differs from the accepted commit');
  assert.equal(git('status', '--porcelain', '--untracked-files=normal'), '', 'Production verification requires a clean checkout');
}

export function productionDatabase(url: unknown, approvedUrl: unknown, env: NodeJS.ProcessEnv = process.env) {
  if (typeof approvedUrl !== 'string' || !approvedUrl.trim() || url !== approvedUrl) throw new Error('Production Turso target must match the accepted release plan');
  if (typeof url !== 'string' || url !== env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) throw new Error('Named production Turso target and read-only credentials are required');
  const parsed = new URL(url);
  if (!['libsql:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== '/')) throw new Error('Expected a credential-free production Turso URL');
  const hostname = (value: string) => value.toLowerCase().replace(/\.$/, '');
  if (env.STAGING_TURSO_HOST && hostname(parsed.hostname) === hostname(env.STAGING_TURSO_HOST)) throw new Error('The staging database cannot be a production recovery target');
  return { url, authToken: env.TURSO_AUTH_TOKEN, intMode: 'bigint' as const };
}

interface ProductionBuckets { accountId: string; documentBucket: string; documentJurisdiction: string; backupBucket: string; backupJurisdiction: string }
export function productionBuckets(targets: ProductionBuckets, approved: ProductionBuckets | null | undefined, env: NodeJS.ProcessEnv = process.env) {
  if (!approved || !['accountId', 'documentBucket', 'documentJurisdiction', 'backupBucket', 'backupJurisdiction'].every(key => Reflect.get(targets, key) === Reflect.get(approved, key))) throw new Error('Production R2 targets must match the accepted release plan');
  const { accountId, documentBucket, documentJurisdiction, backupBucket, backupJurisdiction } = targets;
  if (!/^[a-f0-9]{32}$/.test(accountId) || documentBucket === backupBucket && documentJurisdiction === backupJurisdiction || ![documentBucket, backupBucket].every(bucket => /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket))) throw new Error('Named separate production buckets are required');
  if (![documentJurisdiction, backupJurisdiction].every(value => ['default', 'eu', 'us', 'fedramp'].includes(value))) throw new Error('Each production bucket requires an explicit supported jurisdiction');
  const endpoint = (jurisdiction: string) => `https://${accountId}${jurisdiction === 'default' ? '' : `.${jurisdiction}`}.r2.cloudflarestorage.com`;
  const staging = env.STAGING_R2_ENDPOINT ? new URL(env.STAGING_R2_ENDPOINT) : null;
  if (staging && (staging.protocol !== 'https:' || staging.username || staging.password || staging.port || staging.pathname !== '/' || staging.search || staging.hash || !/^[a-f0-9]{32}(?:\.(?:eu|us|fedramp))?\.r2\.cloudflarestorage\.com\.?$/.test(staging.hostname))) throw new Error('A reviewed staging R2 account and jurisdiction endpoint is required');
  if (staging) staging.hostname = staging.hostname.replace(/\.$/, '');
  for (const [bucket, jurisdiction] of [[documentBucket, documentJurisdiction], [backupBucket, backupJurisdiction]]) {
    if (bucket === env.STAGING_R2_BUCKET && (!staging || staging.origin === endpoint(jurisdiction))) throw new Error('The staging bucket cannot be a production recovery target; its full endpoint is required to establish separation');
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

async function main() {
  const [file, phase, revision, ...extra] = process.argv.slice(2);
  if (!file || !['before', 'after'].includes(phase) || !revision || extra.length) throw new Error('Usage: archive:verify-recovery -- private-cutover-record.json before|after accepted-commit');
  const record = JSON.parse(await readFile(file, 'utf8'));
  assertProductionApproval(record, revision);
  assertProductionCheckout(revision);
  const plan = JSON.parse(await readFile(new URL('../data/release/stage-one.json', import.meta.url), 'utf8'));
  if (plan.publicationReviewPending.length || record.snapshotVersion !== plan.expected.snapshotVersion) throw new Error('Release publication review must pass before production verification');
  const buckets = productionBuckets(record.targets, plan.productionR2);
  const databaseConfig = productionDatabase(record.targets.tursoDatabaseUrl, plan.productionTursoDatabaseUrl);
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
      const restored = await verifySqlRecovery(backup.file, backup.sha256, name === 'post' ? record.snapshotVersion : null, currentPhase ? productionDigest : undefined);
      const object = await storage.send(new GetObjectCommand({ Bucket: buckets.backupBucket, Key: backup.key }));
      if (!object.Body) throw new Error('Locked backup has no body');
      const bytes = await object.Body.transformToByteArray();
      assert.equal(bytes.byteLength, restored.byteSize); assert.equal(createHash('sha256').update(bytes).digest('hex'), backup.sha256);
      verified.push({ phase: name, ...restored, matchesCurrentProduction: currentPhase });
    }
    console.log(JSON.stringify({ status: 'recovery_evidence_checked_not_deployed', acceptedCommit: revision, databaseUrl: databaseConfig.url, phase, verified }));
  } finally { storage.destroy(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('Production recovery gate failed. No deployment, database import or provider write was performed.'); process.exitCode = 1; });
