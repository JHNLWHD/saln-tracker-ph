import assert from 'node:assert/strict';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import test from 'node:test';
import { rehearseStageOne, verifyReleaseHttp } from '../scripts/verify-release';

test('release rehearsal reconciles the fixed baseline and HTTP acceptance rejects a mismatched public snapshot', async () => {
  const result = await rehearseStageOne();
  const plan = JSON.parse(await readFile(new URL('../data/release/stage-one.json', import.meta.url), 'utf8'));
  assert.deepEqual(result.expectation, plan.expected);
  assert.equal(result.expectation.counts.people, 27); assert.equal(result.expectation.counts.sourceDocuments, 0);
  assert.ok(result.publicationReviewPending.length > 0);
  const server = createServer((request, response) => {
    response.setHeader('X-Archive-Revision', 'synthetic-test-revision');
    response.end(request.url === '/ping' ? 'pong' : '{}');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address === 'object');
  try { await assert.rejects(verifyReleaseHttp(`http://127.0.0.1:${address.port}`, 'synthetic-test-revision', result.artifacts), /Expected values/); }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('release rehearsal verifies acquired Filing bytes on import and unchanged replay', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'saln-release-filing-'));
  try {
    await cp(new URL('../data/reviewed/', import.meta.url), join(directory, 'reviewed'), { recursive: true });
    await mkdir(join(directory, 'release'));
    const plan = JSON.parse(await readFile(new URL('../data/release/stage-one.json', import.meta.url), 'utf8'));
    const filing = JSON.parse(await readFile(new URL('../data/examples/hontiveros-2024-local-verification/0002-hontiveros-2024-page-1.json', import.meta.url), 'utf8'));
    const bytes = Buffer.from('%PDF-1.7\nSynthetic release rehearsal document\n%%EOF\n'), hash = createHash('sha256').update(bytes).digest('hex');
    Object.assign(filing.payload.document, { fileName: 'synthetic.pdf', mediaType: 'application/pdf', byteSize: bytes.byteLength, sha256: hash });
    await writeFile(join(directory, 'reviewed/synthetic-filing.json'), JSON.stringify(filing));
    plan.manifests.push('synthetic-filing.json');
    const planFile = pathToFileURL(join(directory, 'release/stage-one.json')), sourceFile = join(directory, 'synthetic.pdf');
    await writeFile(planFile, JSON.stringify(plan)); await writeFile(sourceFile, bytes);
    await assert.rejects(rehearseStageOne({}, planFile), /requires its local acquired source file/);
    const result = await rehearseStageOne({ 'synthetic-filing.json': sourceFile }, planFile);
    assert.equal(result.expectation.counts.filings, 1); assert.equal(result.expectation.counts.sourceDocuments, 1);
    assert.equal(result.artifacts.checksumManifest.documents[0].sha256, hash);
    assert.equal(result.artifacts.checksumManifest.documents[0].byteSize, bytes.byteLength);
    await writeFile(sourceFile, Buffer.from('incorrect source bytes'));
    await assert.rejects(rehearseStageOne({ 'synthetic-filing.json': sourceFile }, planFile), /byte size|checksum|signature/i);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('HTTP acceptance requires aliases to stay on the named deployment', async () => {
  const { artifacts } = await rehearseStageOne();
  let crossOrigin = false;
  let redirectedPath = '';
  let sameOriginRedirect: [string, string] | null = null;
  let badPing = false;
  const other = createServer((_request, response) => response.end('Another deployment'));
  other.listen(0, '127.0.0.1'); await once(other, 'listening');
  const otherAddress = other.address(); assert.ok(otherAddress && typeof otherAddress === 'object');
  const server = createServer((request, response) => {
    const path = request.url!;
    if (path === redirectedPath) { response.statusCode = 302; response.setHeader('Location', `http://127.0.0.1:${otherAddress.port}${path}`); response.end(); return; }
    if (sameOriginRedirect?.[0] === path) { response.statusCode = 307; response.setHeader('Location', sameOriginRedirect[1]); response.end(); return; }
    if (path === '/ping') { response.setHeader('X-Archive-Revision', 'synthetic'); response.end(badPing ? 'wrong response' : 'pong'); }
    else if (path === '/data/archive.json') { response.statusCode = 307; response.setHeader('Location', `/data/${artifacts.snapshot.version}/archive.json`); response.end(); }
    else if (path.endsWith('/archive.json')) response.end(artifacts.snapshotJson);
    else if (path.endsWith('/source-checksums.json')) response.end(artifacts.checksumManifestJson);
    else if (path === '/unknown-release-check-path') { response.statusCode = 404; response.end(); }
    else {
      const alias = artifacts.snapshot.data.personAliases.find(row => path === `/official/${encodeURIComponent(row.value)}`);
      const person = alias && artifacts.snapshot.data.people.find(row => row.id === alias.personId);
      if (person && alias!.value !== person.slug) {
        response.statusCode = 301;
        response.setHeader('Location', `${crossOrigin ? 'https://other.example' : ''}/official/${person.slug}`);
      }
      response.end('<html>synthetic</html>');
    }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address === 'object');
  try {
    const origin = `http://127.0.0.1:${address.port}`;
    assert.ok((await verifyReleaseHttp(origin, 'synthetic', artifacts)).checkedAliases > 0);
    crossOrigin = true;
    await assert.rejects(verifyReleaseHttp(origin, 'synthetic', artifacts), /escaped the named deployment/);
    crossOrigin = false;
    for (const path of ['/ping', '/data/archive.json', '/data/source-checksums.json', '/', `/official/${artifacts.snapshot.data.people[0].slug}`]) {
      redirectedPath = path;
      await assert.rejects(verifyReleaseHttp(origin, 'synthetic', artifacts), /escaped the named deployment/);
    }
    redirectedPath = '';
    for (const redirect of [['/people', '/'], [`/data/${artifacts.snapshot.version}/archive.json`, '/data/archive.json'], ['/data/archive.json', `/data/${artifacts.snapshot.version}/archive.json?other=1`]] as [string, string][]) {
      sameOriginRedirect = redirect;
      await assert.rejects(verifyReleaseHttp(origin, 'synthetic', artifacts));
    }
    sameOriginRedirect = null; badPing = true;
    await assert.rejects(verifyReleaseHttp(origin, 'synthetic', artifacts), /Expected values/);
  } finally { await Promise.all([server, other].map(server => new Promise<void>(resolve => server.close(() => resolve())))); }
});
