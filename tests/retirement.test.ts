import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
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
  const commit = git(['rev-parse', 'HEAD']).toString().trim();
  const snapshotData = { legacyDocuments: [{ path: '/saln/test.pdf', sourceDocumentId: 'source-test', sha256: hash }], sourceDocuments: [{ id: 'source-test', sha256: hash }] };
  const version = createHash('sha256').update(JSON.stringify({ schemaVersion: 1, data: snapshotData })).digest('hex');
  let corrupt = false, redirectCanonical = false, corruptSnapshot = false;
  let redirectedPath = '', badPing = false;
  let legacyLocation = `/documents/${hash}`;
  const other = createServer((request, response) => {
    response.setHeader('X-Archive-Revision', commit);
    response.end(request.url === '/ping' ? 'pong' : JSON.stringify({ schemaVersion: 1, version, data: snapshotData }));
  });
  other.listen(0, '127.0.0.1'); await once(other, 'listening');
  const otherAddress = other.address(); assert.ok(otherAddress && typeof otherAddress === 'object');
  const server = createServer((request, response) => {
    if (request.url === redirectedPath) { response.statusCode = 302; response.setHeader('Location', `http://127.0.0.1:${otherAddress.port}${request.url}`); response.end(); return; }
    if (request.url === '/ping') { response.setHeader('X-Archive-Revision', commit); response.end(badPing ? 'wrong response' : 'pong'); }
    else if (request.url === '/data/archive.json') { response.statusCode = 307; response.setHeader('Location', `/data/${version}/archive.json`); response.end(); }
    else if (request.url === `/data/${version}/archive.json`) response.end(JSON.stringify({ schemaVersion: 1, version, data: corruptSnapshot ? { ...snapshotData, tampered: true } : snapshotData }));
    else if (request.url === '/saln/test.pdf') { response.statusCode = 301; response.setHeader('Location', legacyLocation); response.end(); }
    else if (request.url === `/documents/${hash}`) {
      if (redirectCanonical) { response.statusCode = 302; response.setHeader('Location', '/backing-copy.pdf'); response.end(); }
      else response.end(corrupt ? 'wrong bytes' : bytes);
    }
    else if (request.url === '/backing-copy.pdf') response.end(bytes);
    else { response.statusCode = 404; response.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const address = server.address(); assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`, record = { productionReportRef: 'Synthetic successful report', rollbackUntil: new Date(Date.now() - 5000).toISOString(), rollbackUsed: false, recoveryCommit: commit, productionCommit: commit, snapshotVersion: version, documents: [{ path: 'public/saln/test.pdf', sourceDocumentId: 'source-test', sha256: hash }] };
  try {
    const indexBefore = await readFile(join(directory, '.git/index'));
    await utimes(join(directory, 'public/saln/test.pdf'), new Date(), new Date(Date.now() + 1000));
    const result = await verifyRetirement(record, origin, directory); assert.equal(result.status, 'verified_removal_plan_no_files_changed'); assert.deepEqual(result.paths, ['public/saln/test.pdf']);
    assert.deepEqual(await readFile(join(directory, '.git/index')), indexBefore, 'Read-only verification must not refresh the Git index');
    assert.deepEqual(await readFile(join(directory, result.paths[0])), bytes);
    for (const location of [`/documents/${hash}?different=1`, `/documents/${hash}#fragment`, `documents/${hash}`]) {
      legacyLocation = location;
      await assert.rejects(verifyRetirement(record, origin, directory), /exact canonical document/);
    }
    legacyLocation = `../documents/${hash}`;
    assert.equal((await verifyRetirement(record, origin, directory)).status, 'verified_removal_plan_no_files_changed');
    legacyLocation = `/documents/${hash}`;
    for (const path of ['/ping', '/data/archive.json']) {
      redirectedPath = path;
      await assert.rejects(verifyRetirement(record, origin, directory), /escaped the named deployment/);
    }
    redirectedPath = ''; badPing = true;
    await assert.rejects(verifyRetirement(record, origin, directory), /Expected values/);
    badPing = false;
    await assert.rejects(verifyRetirement({ ...record, documents: [] }, origin, directory), /Every tracked PDF/);
    await assert.rejects(verifyRetirement({ ...record, rollbackUntil: new Date(Date.now() + 3600000).toISOString() }, origin, directory), /closed rollback/);
    await assert.rejects(verifyRetirement({ ...record, productionReportRef: 'pending' }, origin, directory), /Successful production/);
    corruptSnapshot = true; await assert.rejects(verifyRetirement(record, origin, directory), /content digest/); corruptSnapshot = false;
    corrupt = true; await assert.rejects(verifyRetirement(record, origin, directory), /Expected values/);
    corrupt = false; redirectCanonical = true;
    await assert.rejects(verifyRetirement(record, origin, directory), /Expected values/);
    assert.equal(git(['ls-files', 'public/saln/test.pdf']).toString().trim(), 'public/saln/test.pdf');
    redirectCanonical = false;
    for (const flag of ['assume-unchanged', 'skip-worktree']) {
      git(['update-index', `--${flag}`, 'public/saln/test.pdf']);
      await writeFile(join(directory, 'public/saln/test.pdf'), 'Hidden changed bytes');
      assert.equal(git(['status', '--porcelain']).toString().trim(), '');
      await assert.rejects(verifyRetirement(record, origin, directory), /Expected values/);
      await writeFile(join(directory, 'public/saln/test.pdf'), bytes);
      git(['update-index', `--no-${flag}`, 'public/saln/test.pdf']);
    }
    git(['rm', '-q', 'public/saln/test.pdf']);
    await assert.rejects(verifyRetirement({ ...record, documents: [] }, origin, directory), /Every tracked PDF/);
    await assert.rejects(verifyRetirement(record, origin, directory), /clean pre-removal state/);
    git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Synthetic premature removal']);
    await assert.rejects(verifyRetirement({ ...record, documents: [] }, origin, directory), /Every tracked PDF/);
    await assert.rejects(verifyRetirement(record, origin, directory), /recovery PDF set/);
  } finally { await Promise.all([server, other].map(server => new Promise<void>(resolve => server.close(() => resolve())))); await rm(directory, { recursive: true, force: true }); }
});

test('retirement recovery and coverage checks stay bound to the supplied repository despite ambient Git overrides', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'saln-retirement-context-'));
  const actual = join(directory, 'actual'), other = join(directory, 'other');
  const bytes = Buffer.from('%PDF-1.7\nSynthetic recovery fixture\n%%EOF\n'), sha256 = createHash('sha256').update(bytes).digest('hex');
  const keys = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]])), originalFetch = globalThis.fetch;
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))), GIT_AUTHOR_DATE: '2026-10-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-10-01T00:00:00Z' };
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim();
  const commit = (cwd: string) => git(cwd, '-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Synthetic recovery fixture');
  try {
    for (const repository of [actual, other]) {
      await mkdir(join(repository, 'public/saln'), { recursive: true });
      await writeFile(join(repository, 'public/saln/test.pdf'), bytes);
      git(repository, 'init', '-q'); git(repository, 'add', '.'); commit(repository);
    }
    const recoveryCommit = git(other, 'rev-parse', 'HEAD');
    assert.equal(git(actual, 'rev-parse', 'HEAD'), recoveryCommit);
    await writeFile(join(actual, 'public/saln/extra.pdf'), bytes);
    git(actual, 'add', '.'); commit(actual);
    const data = { legacyDocuments: [{ path: '/saln/test.pdf', sourceDocumentId: 'source-test', sha256 }], sourceDocuments: [{ id: 'source-test', sha256 }] };
    const snapshotVersion = createHash('sha256').update(JSON.stringify({ schemaVersion: 1, data })).digest('hex');
    const record = { productionReportRef: 'Synthetic successful report', rollbackUntil: '2026-01-01T00:00:00Z', rollbackUsed: false, recoveryCommit, productionCommit: recoveryCommit, snapshotVersion, documents: [{ path: 'public/saln/test.pdf', sourceDocumentId: 'source-test', sha256 }] };
    globalThis.fetch = async input => {
      const path = new URL(String(input)).pathname;
      if (path === '/ping') return new Response('pong', { headers: { 'X-Archive-Revision': recoveryCommit } });
      if (path === '/data/archive.json') return new Response(null, { status: 307, headers: { Location: `/data/${snapshotVersion}/archive.json` } });
      if (path === `/data/${snapshotVersion}/archive.json`) return Response.json({ schemaVersion: 1, version: snapshotVersion, data });
      if (path === '/saln/test.pdf') return new Response(null, { status: 301, headers: { Location: `/documents/${sha256}` } });
      return new Response(bytes);
    };
    assert.equal((await verifyRetirement(record, 'https://synthetic.invalid', other)).status, 'verified_removal_plan_no_files_changed');
    Object.assign(process.env, { GIT_DIR: join(other, '.git'), GIT_WORK_TREE: other, GIT_INDEX_FILE: join(other, '.git/index'), GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'status.showUntrackedFiles', GIT_CONFIG_VALUE_0: 'no' });
    await assert.rejects(verifyRetirement(record, 'https://synthetic.invalid', actual), /recovery PDF set/);
    assert.equal((await verifyRetirement(record, 'https://synthetic.invalid', other)).status, 'verified_removal_plan_no_files_changed');
    await assert.rejects(verifyRetirement(record, 'https://synthetic.invalid', join(actual, 'public')), /repository root/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    await rm(directory, { recursive: true, force: true });
  }
});
