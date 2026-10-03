import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { S3Client } from '@aws-sdk/client-s3';
import { createDocumentStorage, createLocalDocumentStorage, createR2DocumentStorage, documentStorageKey } from '../app/storage/objects.server';

const bytes = Buffer.from('%PDF-1.7\nSynthetic Source Document for storage checks.\n');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const mediaType = 'application/pdf';

test('local storage creates complete immutable objects, verifies duplicates, and cleans temporary files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'saln-documents-'));
  try {
    const storage = createLocalDocumentStorage(directory);
    assert.equal(await storage.get(sha256), null);
    const results = await Promise.all(Array.from({ length: 4 }, () => storage.put(bytes, sha256, mediaType)));
    assert.equal(results.filter(result => result.created).length, 1);
    assert.ok(results.every(result => result.storageKey === documentStorageKey(sha256)));
    assert.deepEqual(await storage.get(sha256), bytes);
    assert.deepEqual(await readdir(join(directory, 'documents/sha256')), [sha256]);
    const path = join(directory, documentStorageKey(sha256));
    await writeFile(path, 'corrupt local object');
    await assert.rejects(storage.get(sha256), /checksum mismatch/);
    await assert.rejects(storage.put(bytes, sha256, mediaType), /checksum mismatch/);
    assert.equal(await readFile(path, 'utf8'), 'corrupt local object');
    assert.deepEqual(await readdir(join(directory, 'documents/sha256')), [sha256]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('checksum and key validation reject mismatched bytes and traversal before writes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'saln-documents-'));
  try {
    const storage = createLocalDocumentStorage(directory);
    await assert.rejects(storage.put(Buffer.from('different'), sha256, mediaType), /checksum mismatch/);
    for (const value of ['../escape', 'a'.repeat(63), sha256.toUpperCase(), `${sha256}/../other`]) {
      assert.throws(() => documentStorageKey(value), /SHA-256/);
      await assert.rejects(storage.get(value), /SHA-256/);
      await assert.rejects(storage.put(bytes, value, mediaType), /SHA-256/);
    }
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function mockR2(responses: { status: number; body?: Uint8Array | string }[]) {
  const requests: { method: string; path: string; headers: Record<string, string> }[] = [];
  const client = new S3Client({
    region: 'auto', endpoint: 'https://storage.example.test', forcePathStyle: true,
    credentials: { accessKeyId: 'test-access', secretAccessKey: 'test-secret' }, maxAttempts: 1,
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
    requestHandler: {
      async handle(request: { method: string; path: string; headers: Record<string, string> }) {
        requests.push({ method: request.method, path: request.path, headers: request.headers });
        const next = responses.shift();
        assert.ok(next, 'Unexpected storage request');
        return { response: { statusCode: next.status, headers: {}, body: Readable.from([next.body ?? '']) } };
      },
    },
  });
  return { storage: createR2DocumentStorage(client, 'archive'), requests };
}

test('R2 signs a conditional create and verifies actual existing bytes after 412', async () => {
  const { storage, requests } = mockR2([{ status: 200 }, { status: 412 }, { status: 200, body: bytes }]);
  assert.deepEqual(await storage.put(bytes, sha256, mediaType), { created: true, storageKey: documentStorageKey(sha256) });
  assert.deepEqual(await storage.put(bytes, sha256, mediaType), { created: false, storageKey: documentStorageKey(sha256) });
  assert.deepEqual(requests.map(request => request.method), ['PUT', 'PUT', 'GET']);
  for (const request of requests.slice(0, 2)) {
    assert.equal(request.headers['if-none-match'], '*');
    assert.equal(request.headers['content-type'], mediaType);
    assert.equal(request.path, `/archive/${documentStorageKey(sha256)}`);
  }
});

test('R2 rejects corrupt duplicate bytes without overwriting and propagates non-404 failures', async () => {
  const corrupt = mockR2([{ status: 412 }, { status: 200, body: 'corrupt object' }]);
  await assert.rejects(corrupt.storage.put(bytes, sha256, mediaType), /checksum mismatch/);
  assert.deepEqual(corrupt.requests.map(request => request.method), ['PUT', 'GET']);
  const missing = mockR2([{ status: 404 }]);
  assert.equal(await missing.storage.get(sha256), null);
  const missingDuplicate = mockR2([{ status: 412 }, { status: 404 }]);
  await assert.rejects(missingDuplicate.storage.put(bytes, sha256, mediaType), /disappeared/);
  const denied = mockR2([{ status: 403 }, { status: 503 }]);
  await assert.rejects(denied.storage.get(sha256));
  await assert.rejects(denied.storage.put(bytes, sha256, mediaType));
  assert.deepEqual(denied.requests.map(request => request.method), ['GET', 'PUT']);
  const invalid = mockR2([]);
  await assert.rejects(invalid.storage.put(Buffer.from('different'), sha256, mediaType), /checksum mismatch/);
  await assert.rejects(invalid.storage.get('../escape'), /SHA-256/);
  assert.equal(invalid.requests.length, 0);
});

test('factory fails closed on missing configuration without exposing values', () => {
  assert.throws(() => createDocumentStorage({}), /ARCHIVE_STORAGE must be local or r2/);
  assert.throws(() => createDocumentStorage({ ARCHIVE_STORAGE: 'local' }), /ARCHIVE_OBJECT_DIR is required/);
  assert.throws(() => createDocumentStorage({ ARCHIVE_STORAGE: 'r2', R2_ENDPOINT: 'http://storage.example.test' }), /must use HTTPS/);
  assert.throws(() => createDocumentStorage({ ARCHIVE_STORAGE: 'r2', R2_ENDPOINT: 'https://storage.example.test', R2_BUCKET: 'archive', R2_ACCESS_KEY_ID: 'must-not-appear' }), error => error instanceof Error && error.message.includes('R2_SECRET_ACCESS_KEY') && !error.message.includes('must-not-appear'));
});
