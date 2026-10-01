import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyRetirement } from '../scripts/verify-retirement';

test('retirement requires complete Git recovery and stable exact bytes, and never removes the verified file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'saln-retirement-fixture-'));
  const bytes = Buffer.from('%PDF-1.7\nSynthetic test document\n%%EOF\n'), hash = createHash('sha256').update(bytes).digest('hex');
  await mkdir(join(directory, 'public/saln'), { recursive: true }); await writeFile(join(directory, 'public/saln/test.pdf'), bytes);
  const git = (args: string[]) => execFileSync('git', args, { cwd: directory });
  git(['init', '-q']); git(['add', 'public/saln/test.pdf']); git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Synthetic fixture']);
  const commit = git(['rev-parse', 'HEAD']).toString().trim(), version = 'a'.repeat(64);
  let corrupt = false;
  const server = createServer((request, response) => {
    if (request.url === '/ping') { response.setHeader('X-Archive-Revision', commit); response.end('pong'); }
    else if (request.url === '/data/archive.json') response.end(JSON.stringify({ version, data: { legacyDocuments: [{ path: '/saln/test.pdf', sourceDocumentId: 'source-test', sha256: hash }], sourceDocuments: [{ id: 'source-test', sha256: hash }] } }));
    else if (request.url === '/saln/test.pdf') { response.statusCode = 301; response.setHeader('Location', `/documents/${hash}`); response.end(); }
    else if (request.url === `/documents/${hash}`) response.end(corrupt ? 'wrong bytes' : bytes);
    else { response.statusCode = 404; response.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const address = server.address(); assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`, record = { productionReportRef: 'Synthetic successful report', rollbackUntil: new Date(Date.now() - 5000).toISOString(), rollbackUsed: false, recoveryCommit: commit, productionCommit: commit, snapshotVersion: version, documents: [{ path: 'public/saln/test.pdf', sourceDocumentId: 'source-test', sha256: hash }] };
  try {
    const result = await verifyRetirement(record, origin, directory); assert.equal(result.status, 'verified_removal_plan_no_files_changed'); assert.deepEqual(result.paths, ['public/saln/test.pdf']);
    assert.deepEqual(await readFile(join(directory, result.paths[0])), bytes);
    await assert.rejects(verifyRetirement({ ...record, documents: [] }, origin, directory), /Every tracked PDF/);
    await assert.rejects(verifyRetirement({ ...record, rollbackUntil: new Date(Date.now() + 3600000).toISOString() }, origin, directory), /closed rollback/);
    await assert.rejects(verifyRetirement({ ...record, productionReportRef: 'pending' }, origin, directory), /Successful production/);
    corrupt = true; await assert.rejects(verifyRetirement(record, origin, directory), /Expected values/);
    assert.equal(git(['ls-files', 'public/saln/test.pdf']).toString().trim(), 'public/saln/test.pdf');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); }
});
