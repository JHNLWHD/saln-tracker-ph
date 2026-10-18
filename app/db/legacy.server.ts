import { connectArchive } from './client.server';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid stored legacy value');
  return value as Record<string, unknown>;
}
function fields(value: unknown) {
  const node = object(value);
  if (node.type !== 'map') throw new Error('Expected a stored legacy map');
  return object(node.fields);
}
function string(value: unknown): string | null {
  if (value === undefined) return null;
  const node = object(value);
  if (node.type === 'null') return null;
  if (node.type !== 'string' || typeof node.value !== 'string') throw new Error('Expected stored legacy text');
  return node.value;
}
function number(value: unknown): number | null {
  if (value === undefined) return null;
  const node = object(value);
  if (node.type === 'null') return null;
  if (node.type !== 'number' || typeof node.value !== 'number' || !Number.isFinite(node.value)) throw new Error('Expected a finite stored legacy number');
  return node.value;
}
function array(value: unknown): unknown[] {
  if (value === undefined) return [];
  const node = object(value);
  if (node.type !== 'array' || !Array.isArray(node.values)) throw new Error('Expected a stored legacy array');
  return node.values;
}

/** Publish only the known fields from the former public interface, never the raw capture. */
function publicProfile(value: unknown) {
  const document = object(value), id = document.id;
  if (typeof id !== 'string' || !id || id.includes('/')) throw new Error('Stored legacy profile has no document ID');
  const profile = fields(document.data);
  const slug = string(profile.slug), name = string(profile.name);
  if (!slug || !name) throw new Error('Stored legacy profile has no name or slug');
  return {
    id, slug, name, position: string(profile.position), agency: string(profile.agency),
    status: string(profile.status), term_start: string(profile.term_start), term_end: string(profile.term_end),
    saln_records: array(profile.saln_records).map(value => {
      const row = fields(value), year = number(row.year);
      if (year === null || !Number.isInteger(year)) throw new Error('Stored legacy entry has no reporting year');
      return {
        year, total_assets: number(row.total_assets), total_liabilities: number(row.total_liabilities), net_worth: number(row.net_worth),
        date_filed: string(row.date_filed), status: string(row.status), source_url: string(row.source_url), source_description: string(row.source_description),
        assets: array(row.assets).map(value => { const item = fields(value); return { description: string(item.description), value: number(item.value), source: string(item.source) }; }),
        liabilities: array(row.liabilities).map(value => { const item = fields(value); return { creditor: string(item.creditor), nature: string(item.nature), balance: number(item.balance) }; }),
      };
    }),
  };
}
export type LegacyProfile = ReturnType<typeof publicProfile>;
export type LegacyRecord = LegacyProfile['saln_records'][number];
export type LegacyData = { capturedAt: string; profiles: LegacyProfile[] };

export async function readLegacyRecords(): Promise<LegacyData | null> {
  if (process.env.ARCHIVE_ENVIRONMENT === 'staging' && process.env.ARCHIVE_ADAPTER !== 'turso') return null;
  if ((process.env.ARCHIVE_ADAPTER ?? 'turso') !== 'turso' || !process.env.TURSO_DATABASE_URL) return null;
  const { client } = connectArchive({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  try {
    // ponytail: read the small preserved collection at once; paginate if its size outgrows the directory.
    const { rows } = await client.execute('SELECT captured_at, documents_json FROM legacy_firestore_captures ORDER BY captured_at DESC, data_sha256 DESC LIMIT 1');
    if (!rows.length) return null;
    const documents: unknown = JSON.parse(String(rows[0].documents_json));
    if (!Array.isArray(documents)) throw new Error('Stored legacy capture has no documents');
    const profiles = documents.map(publicProfile);
    if (new Set(profiles.map(profile => profile.id)).size !== profiles.length) throw new Error('Stored legacy document IDs are not unique');
    if (new Set(profiles.map(profile => profile.slug)).size !== profiles.length) throw new Error('Stored legacy profile slugs are not unique');
    return { capturedAt: String(rows[0].captured_at), profiles };
  } catch (error) {
    // Canonical-only databases and local test fixtures can predate the optional legacy copy.
    if (error instanceof Error && /no such table: (?:main\.)?legacy_firestore_captures\b/i.test(error.message)) return null;
    throw error;
  } finally { client.close(); }
}
