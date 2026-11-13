import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import type { SourceDocument } from '../archive/types';

export interface DocumentStorage {
  put(bytes: Uint8Array, sha256: string, mediaType: string): Promise<{ created: boolean; storageKey: string }>;
  get(sha256: string): Promise<Uint8Array | null>;
}

export class DocumentStorageUnavailableError extends Error {}

export function documentStorageKey(sha256: SourceDocument['sha256']): string {
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('A lowercase SHA-256 checksum is required');
  return `documents/sha256/${sha256}`;
}

function verifyChecksum(bytes: Uint8Array, sha256: string): void {
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) {
    throw new Error('Source Document checksum mismatch');
  }
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

export function createLocalDocumentStorage(directory: string): DocumentStorage {
  const root = resolve(directory);
  const storage: DocumentStorage = {
    async get(sha256) {
      const path = join(root, documentStorageKey(sha256));
      try {
        const bytes = await readFile(path);
        verifyChecksum(bytes, sha256);
        return bytes;
      } catch (error) {
        if (hasCode(error, 'ENOENT')) return null;
        throw error;
      }
    },
    async put(bytes, sha256, _mediaType) {
      const storageKey = documentStorageKey(sha256);
      const body = Uint8Array.from(bytes);
      verifyChecksum(body, sha256);
      const path = join(root, storageKey);
      await mkdir(dirname(path), { recursive: true });
      const temporary = join(dirname(path), `.upload-${randomUUID()}`);
      try {
        await writeFile(temporary, body, { flag: 'wx', mode: 0o600 });
        try {
          // A hard link publishes complete bytes atomically and cannot replace an existing file.
          await link(temporary, path);
          return { created: true, storageKey };
        } catch (error) {
          if (!hasCode(error, 'EEXIST')) throw error;
          if (await storage.get(sha256) === null) throw new Error('Source Document disappeared during duplicate verification');
          return { created: false, storageKey };
        }
      } finally {
        await rm(temporary, { force: true });
      }
    },
  };
  return storage;
}

export function createR2DocumentStorage(client: S3Client, bucket: string): DocumentStorage {
  const storage: DocumentStorage = {
    async get(sha256) {
      const Key = documentStorageKey(sha256);
      let bytes: Uint8Array;
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key }));
        if (!result.Body) throw new Error('Source Document response has no body');
        bytes = await result.Body.transformToByteArray();
      } catch (error) {
        if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) return null;
        throw new DocumentStorageUnavailableError('Source Document storage is unavailable', { cause: error });
      }
      verifyChecksum(bytes, sha256);
      return bytes;
    },
    async put(bytes, sha256, mediaType) {
      const storageKey = documentStorageKey(sha256);
      const Body = Uint8Array.from(bytes);
      verifyChecksum(Body, sha256);
      try {
        // R2 supports conditional PutObject: https://developers.cloudflare.com/r2/api/s3/api/
        await client.send(new PutObjectCommand({ Bucket: bucket, Key: storageKey, Body, ContentType: mediaType, IfNoneMatch: '*' }));
        return { created: true, storageKey };
      } catch (error) {
        if (!(error instanceof S3ServiceException) || error.$metadata.httpStatusCode !== 412) throw error;
        if (await storage.get(sha256) === null) throw new Error('Source Document disappeared during duplicate verification');
        return { created: false, storageKey };
      }
    },
  };
  return storage;
}

export function createDocumentStorage(env: NodeJS.ProcessEnv = process.env): DocumentStorage {
  function required(name: string): string {
    const value = env[name];
    if (!value?.trim()) throw new Error(`${name} is required for Source Document storage`);
    return value;
  }
  if (env.ARCHIVE_STORAGE === 'local') return createLocalDocumentStorage(required('ARCHIVE_OBJECT_DIR'));
  if (env.ARCHIVE_STORAGE !== 'r2') throw new Error('ARCHIVE_STORAGE must be local or r2');
  const endpoint = required('R2_ENDPOINT');
  let endpointUrl: URL;
  try { endpointUrl = new URL(endpoint); } catch { throw new Error('R2_ENDPOINT must be an absolute HTTPS URL'); }
  if (endpointUrl.protocol !== 'https:' || endpointUrl.username || endpointUrl.password) throw new Error('R2_ENDPOINT must use HTTPS without embedded credentials');
  const bucket = required('R2_BUCKET');
  const client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId: required('R2_ACCESS_KEY_ID'), secretAccessKey: required('R2_SECRET_ACCESS_KEY') },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  return createR2DocumentStorage(client, bucket);
}
