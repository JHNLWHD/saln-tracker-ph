import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
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
