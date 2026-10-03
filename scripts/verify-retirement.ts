import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

interface RetirementRecord {
  productionReportRef: string; rollbackUntil: string; rollbackUsed: boolean; recoveryCommit: string; productionCommit: string; snapshotVersion: string;
  documents: { path: string; sourceDocumentId: string; sha256: string }[];
}

/** Read-only: prints reviewed removal paths after every recovery and route check passes. */
export async function verifyRetirement(record: RetirementRecord, origin: string, repository = process.cwd()) {
  if (!record.productionReportRef?.trim() || /^(pending|unapproved|example)$/i.test(record.productionReportRef.trim()) || !Number.isFinite(Date.parse(record.rollbackUntil)) || Date.parse(record.rollbackUntil) > Date.now() || record.rollbackUsed !== false) throw new Error('Successful production verification and a closed rollback window are required');
  if (![record.recoveryCommit, record.productionCommit].every(value => /^[a-f0-9]{40}$/.test(value)) || !/^[a-f0-9]{64}$/.test(record.snapshotVersion)) throw new Error('Exact recovery, production and snapshot revisions are required');
  const base = new URL(origin);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('A credential-free production origin is required');
  // ponytail: verify one buffered Git blob at a time, capped at 256 MiB; stream if larger originals are acquired.
  const git = (args: string[]) => execFileSync('git', args, { cwd: repository, maxBuffer: 256 * 1024 * 1024 });
  const paths = git(['ls-files', '-z', 'public/saln/']).toString().split('\0').filter(path => path.toLowerCase().endsWith('.pdf')).sort();
  assert.deepEqual(record.documents.map(row => row.path).sort(), paths, 'Every tracked PDF needs one reviewed mapping');
  const get = (path: string, init?: RequestInit) => fetch(new URL(path, base), { signal: AbortSignal.timeout(30000), ...init });
  const ping = await get('/ping'); assert.equal(ping.status, 200); assert.equal(ping.headers.get('X-Archive-Revision'), record.productionCommit);
  const response = await get('/data/archive.json'); assert.equal(response.status, 200); const snapshot = await response.json();
  assert.equal(snapshot.version, record.snapshotVersion);
  const removed = [];
  for (const document of record.documents) {
    if (!/^public\/saln\/.+\.pdf$/i.test(document.path) || document.path.split('/').some(part => part === '..' || part === '.') || !/^[a-f0-9]{64}$/.test(document.sha256)) throw new Error('Invalid retirement path or checksum');
    const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
    const current = await readFile(join(repository, document.path)); assert.equal(hash(current), document.sha256);
    const recovered = git(['cat-file', 'blob', `${record.recoveryCommit}:${document.path}`]); assert.equal(hash(recovered), document.sha256);
    const entry = snapshot.data.legacyDocuments.find((entry: { path: string; sourceDocumentId: string; sha256: string }) => entry.path === document.path.slice('public'.length));
    assert.ok(entry, 'Stable URL has no approved mapping'); assert.equal(entry.sourceDocumentId, document.sourceDocumentId); assert.equal(entry.sha256, document.sha256);
    const source = snapshot.data.sourceDocuments.find((entry: { id: string; sha256: string }) => entry.id === document.sourceDocumentId);
    assert.ok(source); assert.equal(source.sha256, document.sha256);
    const legacy = await get(entry.path, { redirect: 'manual' }); assert.equal(legacy.status, 301);
    const target = new URL(legacy.headers.get('Location')!, base); assert.equal(target.origin, base.origin); assert.equal(target.pathname, `/documents/${document.sha256}`);
    const bytes = await get(target.pathname, { redirect: 'manual' }); assert.equal(bytes.status, 200); assert.equal(hash(new Uint8Array(await bytes.arrayBuffer())), document.sha256);
    removed.push(document.path);
  }
  return { status: 'verified_removal_plan_no_files_changed', recoveryCommit: record.recoveryCommit, productionCommit: record.productionCommit, paths: removed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [file, origin, ...extra] = process.argv.slice(2);
  (async () => { if (!file || !origin || extra.length) throw new Error('Usage: archive:verify-retirement -- private-record.json production-origin'); console.log(JSON.stringify(await verifyRetirement(JSON.parse(await readFile(file, 'utf8')), origin))); })()
    .catch(() => { console.error('Retirement verification failed. No Git-held document or remote data was removed.'); process.exitCode = 1; });
}
