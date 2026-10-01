import { and, eq, inArray, or, sql, type SQLWrapper } from "drizzle-orm";
import type { IdentityMatch } from "../archive/types";
import type { ArchiveReader, ArchiveWriter } from "./client.server";
import { missingRows } from "./canonical";
import type { ReviewedIdentities } from "./identity-validation";
import * as schema from "./schema";
import { checkCitationMetadata, readEditorialCorrections } from "./corrections.server";

/** UNION terminates even a corrupt cycle; a cycle has no survivor and fails closed. */
export function canonicalPersonId(id: SQLWrapper | string) {
  return sql`(with recursive identity_chain(id) as (
    select ${id} union select ${schema.identityMatches.toPersonId} from ${schema.identityMatches}
    join identity_chain on ${schema.identityMatches.fromPersonId} = identity_chain.id
  ) select id from identity_chain where not exists (
    select 1 from ${schema.identityMatches} where ${schema.identityMatches.fromPersonId} = identity_chain.id
  ) limit 1)`;
}

export async function readIdentityMatches(db: ArchiveReader): Promise<IdentityMatch[]> {
  return db.select({ id: schema.identityMatches.id, fromPersonId: schema.identityMatches.fromPersonId, toPersonId: schema.identityMatches.toPersonId,
    reason: schema.identityMatches.reason, reviewedAt: schema.identityMatches.reviewedAt, citations: schema.identityMatches.citations })
    .from(schema.identityMatches).orderBy(schema.identityMatches.id);
}

export function resolveIdentity(id: string, matches: Pick<IdentityMatch, "fromPersonId" | "toPersonId">[]): string {
  const visited = new Set<string>();
  for (;;) {
    if (visited.has(id)) throw new Error("Identity Match redirect loop");
    visited.add(id);
    const match = matches.find(row => row.fromPersonId === id);
    if (!match) return id;
    id = match.toPersonId;
  }
}

export function identityLineage(id: string, matches: IdentityMatch[]): string[] {
  // ponytail: the reviewed merge graph is small; index ancestry if it grows beyond a roster.
  return [id, ...matches.map(row => row.fromPersonId).filter(source => resolveIdentity(source, matches) === id)].sort();
}

export async function findPersonIdentifier(db: ArchiveReader, key: string) {
  const people = await db.select().from(schema.people).where(or(eq(schema.people.slug, key), eq(schema.people.id, key)));
  const aliases = await db.select().from(schema.personAliases).where(eq(schema.personAliases.value, key));
  const matches = await readIdentityMatches(db);
  const targets = new Set([...people.map(person => person.id), ...aliases.map(alias => alias.personId)].map(id => resolveIdentity(id, matches)));
  if (targets.size > 1) throw new Error("Person identifier collision");
  const id = [...targets][0];
  if (!id) return null;
  const [survivor] = await db.select().from(schema.people).where(eq(schema.people.id, id));
  return survivor ?? null;
}

/** IDs, slugs, and former identifiers share the same public URL namespace. */
export async function checkPersonIdentifiers(db: ArchiveReader, proposed: { value: string; personId: string }[], matches?: IdentityMatch[]) {
  const graph = matches ?? await readIdentityMatches(db);
  const values = proposed.map(row => row.value);
  const people = await db.select({ id: schema.people.id, slug: schema.people.slug }).from(schema.people)
    .where(or(inArray(schema.people.id, values), inArray(schema.people.slug, values)));
  const aliases = await db.select({ value: schema.personAliases.value, personId: schema.personAliases.personId }).from(schema.personAliases).where(inArray(schema.personAliases.value, values));
  const owners = new Map<string, string>();
  for (const row of [...proposed, ...aliases, ...people.flatMap(person => [person.id, person.slug].filter(value => values.includes(value)).map(value => ({ value, personId: person.id })))]) {
    const owner = resolveIdentity(row.personId, graph);
    if (owners.has(row.value) && owners.get(row.value) !== owner) throw new Error("Person identifier collision");
    owners.set(row.value, owner);
  }
}

/** New links are explicit reviewed rows; source records are never reassigned or deleted. */
export async function writeReviewedIdentities(db: ArchiveWriter, manifestId: string, input: ReviewedIdentities, verifyOnly = false) {
  const savedMatches = await db.select().from(schema.identityMatches);
  const expected = input.matches.map(row => ({ ...row, manifestId, reviewedAt: input.review.reviewedAt }));
  const newMatches = missingRows(savedMatches, expected, row => row.id, "Identity Match", verifyOnly);
  const graph = [...savedMatches, ...newMatches];
  if (new Set(graph.map(row => row.fromPersonId)).size !== graph.length) throw new Error("Person already has a reviewed merge target");
  for (const row of expected) {
    resolveIdentity(row.fromPersonId, graph);
    const people = await db.select({ id: schema.people.id }).from(schema.people).where(or(eq(schema.people.id, row.fromPersonId), eq(schema.people.id, row.toPersonId)));
    if (people.length !== 2) throw new Error("Identity Match must refer to two existing People");
  }
  await checkCitationMetadata(db, expected.flatMap(row => row.citations), await readEditorialCorrections(db));
  if (newMatches.length) await db.insert(schema.identityMatches).values(newMatches);
  const aliases = input.legacyPeople.flatMap(entry => [
    ...entry.slugs.map(value => ({ kind: "slug" as const, value })),
    ...entry.identifiers.map(value => ({ kind: "identifier" as const, value })),
  ].map(alias => ({ ...alias, personId: entry.person.id, sourceUrl: entry.sourceUrl, manifestId })));
  if (new Set(aliases.map(row => `${row.kind}:${row.value}`)).size !== aliases.length) throw new Error("Legacy aliases collide within this manifest");
  await checkPersonIdentifiers(db, aliases, graph);
  const missingAliases = missingRows(await db.select().from(schema.personAliases), aliases, row => `${row.kind}:${row.value}`, "Person alias", verifyOnly);
  if (missingAliases.length) await db.insert(schema.personAliases).values(missingAliases);
  const documents = input.documents.map(row => ({ ...row, manifestId }));
  for (const row of documents) {
    const [document] = await db.select().from(schema.sourceDocuments).where(and(eq(schema.sourceDocuments.id, row.sourceDocumentId), eq(schema.sourceDocuments.sha256, row.sha256)));
    if (!document || document.mediaType !== "application/pdf") throw new Error("Legacy PDF must match an acquired PDF Source Document's exact checksum");
  }
  const missingDocuments = missingRows(await db.select().from(schema.legacyDocuments), documents, row => row.path, "Legacy document", verifyOnly);
  if (missingDocuments.length) await db.insert(schema.legacyDocuments).values(missingDocuments);
}
