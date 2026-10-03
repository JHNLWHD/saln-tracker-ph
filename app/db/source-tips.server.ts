import { createHmac, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { and, count, eq, gte } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { Client } from '@libsql/client';
import { connectArchive } from './client.server';

/** This table exists only in the separate private destination, never in the Archive schema. */
const tips = sqliteTable('source_tips', {
  id: text('id').primaryKey(), sourceUrl: text('source_url').notNull(), explanation: text('explanation').notNull(), contact: text('contact'), personHint: text('person_hint'), receivedAt: text('received_at').notNull(), rateKey: text('rate_key'),
});
export interface SourceTipInput { sourceUrl: string; explanation: string; contact: string; personHint: string }

export function sourceTipDestination(env: NodeJS.ProcessEnv = process.env) {
  const url = env.SOURCE_TIPS_DATABASE_URL;
  if (!url) throw new Error('Source Tips destination is not configured');
  const normalized = (value: string) => value.startsWith('file:') ? resolve(value.slice(5)) : new URL(value).hostname.toLowerCase();
  if (normalized(url) === normalized(env.TURSO_DATABASE_URL || 'file:.data/archive.db')) throw new Error('Source Tips require a separate private database');
  if (url.startsWith('file:')) return { url };
  const parsed = new URL(url);
  if (!['libsql:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || !env.SOURCE_TIPS_AUTH_TOKEN) throw new Error('A private SQL destination and token are required');
  if (env.SOURCE_TIPS_AUTH_TOKEN === env.TURSO_AUTH_TOKEN) throw new Error('Source Tips require a separate private database token');
  return { url, authToken: env.SOURCE_TIPS_AUTH_TOKEN };
}

export function sourceTipsConfigured() {
  try { const config = sourceTipDestination(); return config.url.startsWith('file:') && process.env.NETLIFY !== 'true' || (process.env.SOURCE_TIPS_RATE_LIMIT_SECRET?.length ?? 0) >= 32; } catch { return false; }
}

function sourceTipRateKey(trustedIp: unknown, env: NodeJS.ProcessEnv) {
  const local = env.SOURCE_TIPS_DATABASE_URL?.startsWith('file:') && env.NETLIFY !== 'true';
  if (local && trustedIp === undefined) return 'local-development';
  if (typeof trustedIp !== 'string' || !isIP(trustedIp) || (env.SOURCE_TIPS_RATE_LIMIT_SECRET?.length ?? 0) < 32) throw new Error('Trusted client address and private rate-limit key are required');
  return createHmac('sha256', env.SOURCE_TIPS_RATE_LIMIT_SECRET!).update(trustedIp).digest('hex');
}

export function validateSourceTip(form: URLSearchParams) {
  const keys = ['sourceUrl', 'explanation', 'contact', 'personHint', 'website'];
  for (const key of form.keys()) if (!keys.includes(key) || form.getAll(key).length !== 1) throw new Error('Unsupported Source Tip field');
  const values: SourceTipInput = { sourceUrl: (form.get('sourceUrl') ?? '').trim(), explanation: (form.get('explanation') ?? '').trim(), contact: (form.get('contact') ?? '').trim(), personHint: (form.get('personHint') ?? '').trim() };
  const errors: Partial<Record<keyof SourceTipInput, string>> = {};
  try { const url = new URL(values.sourceUrl); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || values.sourceUrl.length > 2048) throw new Error(); }
  catch { errors.sourceUrl = 'Enter a complete public HTTP or HTTPS source URL without credentials.'; }
  if (values.explanation.length < 8 || values.explanation.length > 4000) errors.explanation = 'Use 8 to 4,000 characters to explain the source.';
  if (values.contact.length > 200) errors.contact = 'Use at most 200 characters for optional contact information.';
  if (values.personHint && !/^[A-Za-z0-9:._-]{1,128}$/.test(values.personHint)) errors.personHint = 'The Person reference is invalid.';
  return { values, errors, spam: Boolean(form.get('website')) };
}

/** Never fetch the submitted URL or write to a public Archive table. */
export async function queueSourceTip(tip: SourceTipInput, trustedIp: unknown, env: NodeJS.ProcessEnv = process.env) {
  const rateKey = sourceTipRateKey(trustedIp, env);
  const { client, db } = connectArchive(sourceTipDestination(env));
  const id = randomUUID();
  try {
    const queued = await db.transaction(async tx => {
      const [recent] = await tx.select({ total: count() }).from(tips).where(and(eq(tips.rateKey, rateKey), gte(tips.receivedAt, new Date(Date.now() - 10 * 60_000).toISOString())));
      if (recent.total >= 5) return false;
      const [queue] = await tx.select({ total: count() }).from(tips);
      // ponytail: bound the first private queue to 1,000 tips; add reviewed retention when volume needs it.
      if (queue.total >= 1000) throw new Error('Private review queue is full');
      await tx.insert(tips).values({ id, ...tip, contact: tip.contact || null, personHint: tip.personHint || null, receivedAt: new Date().toISOString(), rateKey });
      return true;
    });
    return queued ? id : null;
  } finally { client.close(); }
}

/** Operators initialize the named destination separately; the public app cannot create its schema. */
export async function initializeSourceTipDestination(client: Client) {
  await client.execute(`CREATE TABLE IF NOT EXISTS source_tips (id text PRIMARY KEY NOT NULL, source_url text NOT NULL, explanation text NOT NULL, contact text, person_hint text, received_at text NOT NULL)`);
  const columns = await client.execute('PRAGMA table_info(source_tips)');
  if (!columns.rows.some(row => row.name === 'rate_key')) await client.execute('ALTER TABLE source_tips ADD COLUMN rate_key text');
  await client.execute('CREATE INDEX IF NOT EXISTS source_tips_rate_key_received_at ON source_tips(rate_key, received_at)');
}

export async function readSourceTipBody(request: Request) {
  if (!request.body) throw new Error('Missing Source Tip body');
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > 65536) throw new Error('Source Tip body is too large'); chunks.push(next.value); } }
  finally { await reader.cancel(); }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}
