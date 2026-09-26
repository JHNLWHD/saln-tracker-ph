import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { eq } from "drizzle-orm";
import { exportPublicSnapshot } from "../app/archive/snapshot.server";
import { connectArchive } from "../app/db/client.server";
import { importReviewedPerson } from "../app/db/people.server";
import * as schema from "../app/db/schema";
import type { ReviewedPerson } from "../app/db/validation";
import { migrateArchive } from "../scripts/migrate";

const checksum = "a".repeat(64);
const privateCanary = "private-reviewer-and-source-tip@example.invalid";

function person(id: string, reverse: boolean): ReviewedPerson {
  const names = [`${id}, Sample`, `Sample ${id}`];
  const supports = ["person", "office", "startDate"];
  return {
    review: { reviewedAt: "2026-09-26", reviewedBy: privateCanary },
    person: { id, slug: id, canonicalName: `Person ${id}`, nameVariants: reverse ? names.reverse() : names },
    jurisdictions: [{ id: "city", name: "Test City", kind: "city" }, { id: "country", name: "Test Country", kind: "country" }],
    jurisdictionRelationships: [{ fromId: "city", toId: "country", kind: "geographic" }],
    offices: [{ id: "office", name: "Test elected office", kind: "elected", included: true, jurisdictionId: "city" }],
    constituencies: [{ id: "constituency", name: "Test electorate", kind: "at_large", jurisdictionId: "city" }],
    electoralTerms: [{ id: "term", officeId: "office", startDate: { value: "2020", precision: "year" }, endDate: null }],
    tenures: [{ id: `tenure-${id}`, personId: id, officeId: "office", electoralTermId: "term", constituencyId: "constituency",
      startDate: { value: "2020", precision: "year" }, endDate: null, assumptionMethod: "unknown", verificationStatus: "verified", disputedFacts: [],
      citations: [{ id: `citation-${id}`, title: `Attributable report for ${id}`, publisher: "Test Publisher", type: "public_article", url: `https://example.org/${id}`,
        publishedDate: { value: "2020-07", precision: "month" }, supports: reverse ? supports.reverse() : supports }],
    }],
  };
}

async function setup(reverse = false) {
  const directory = await mkdtemp(join(tmpdir(), "saln-snapshot-test-"));
  const connection = connectArchive({ url: `file:${join(directory, "archive.db")}` });
  await migrateArchive(connection.db);
  const ids = reverse ? ["person-b", "person-a"] : ["person-a", "person-b"];
  for (const id of ids) await importReviewedPerson(connection.db, person(id, reverse));
  const filingRows = ["filing-a", "filing-b"].map(id => ({
    id, personId: "person-a", filerName: "PERSON, SAMPLE", reportingDate: "2024", executionDate: "2025-01", receiptDate: null,
    supersedesFilingId: null, reviewedAt: "2026-09-26", reviewedBy: privateCanary,
  }));
  await connection.db.insert(schema.filings).values(reverse ? filingRows.reverse() : filingRows);
  const documents = [
    { id: "document-a", filingId: "filing-a" },
    { id: "document-b", filingId: "filing-a" },
    { id: "document-c", filingId: "filing-b" },
  ].map(row => ({
    ...row, fileName: `${row.id}.pdf`, mediaType: "application/pdf", byteSize: 123, sha256: checksum, storageKey: `documents/sha256/${checksum}`,
    originalUrl: `https://example.org/${row.id}.pdf`, provenanceType: "official_download" as const, provenanceNote: "Synthetic test provenance.",
    officialReleaseDate: null, acquisitionDate: "2026-09", archivePublicationDate: "2026-09-26T10:00:00.000Z", transcriptionLevel: "document_only" as const,
  }));
  await connection.db.insert(schema.sourceDocuments).values(reverse ? documents.reverse() : documents);
  return { ...connection, async close() { connection.client.close(); await rm(directory, { recursive: true, force: true }); } };
}

test("snapshot bytes are stable across reruns and insertion order, with a content-derived version and precise dates", async () => {
  const first = await setup(), second = await setup(true);
  try {
    const result = await exportPublicSnapshot(first.db);
    assert.deepEqual(await exportPublicSnapshot(first.db), result);
    assert.deepEqual(await exportPublicSnapshot(second.db), result);
    assert.equal(result.snapshot.version, createHash("sha256").update(JSON.stringify({ schemaVersion: 1, data: result.snapshot.data })).digest("hex"));
    assert.equal(result.checksumManifest.version, result.snapshot.version);
    assert.deepEqual(JSON.parse(result.snapshotJson), result.snapshot);
    assert.deepEqual(JSON.parse(result.checksumManifestJson), result.checksumManifest);
    assert.ok(result.snapshotJson.endsWith("\n"));
    const data = result.snapshot.data;
    assert.deepEqual(data.people.map(row => row.id), ["person-a", "person-b"]);
    assert.deepEqual(data.personNames.map(row => row.value), ["Sample person-a", "person-a, Sample", "Sample person-b", "person-b, Sample"]);
    assert.deepEqual(data.filings[0].reportingDate, { value: "2024", precision: "year" });
    assert.deepEqual(data.filings[0].executionDate, { value: "2025-01", precision: "month" });
    assert.equal(data.filings[0].receiptDate, null);
    assert.deepEqual(data.sourceDocuments[0].acquisitionDate, { value: "2026-09", precision: "month" });
    assert.equal(data.sourceDocuments[0].officialReleaseDate, null);
    assert.equal(data.sourceDocuments[0].archivePublicationDate, "2026-09-26T10:00:00.000Z");
    assert.equal(data.sourceDocuments[0].provenanceNote, "Synthetic test provenance.");
    assert.deepEqual(data.tenures[0].startDate, { value: "2020", precision: "year" });
    assert.equal(data.tenures[0].endDate, null);
    assert.deepEqual(data.citations[0].publishedDate, { value: "2020-07", precision: "month" });
    assert.deepEqual(data.jurisdictions.map(row => row.id), ["city", "country"]);
    assert.deepEqual(data.jurisdictionRelationships, [{ fromId: "city", toId: "country", kind: "geographic" }]);
    assert.doesNotMatch(result.snapshotJson, /storageKey|reviewedBy|generatedAt|financialSummaries|private-reviewer/);
    await first.db.update(schema.people).set({ canonicalName: "Reviewed corrected name" }).where(eq(schema.people.id, "person-a"));
    assert.notEqual((await exportPublicSnapshot(first.db)).snapshot.version, result.snapshot.version);
  } finally { await first.close(); await second.close(); }
});

test("checksum manifest groups exact files without merging Source Documents or same-period Filings", async () => {
  const { db, close } = await setup();
  try {
    const result = await exportPublicSnapshot(db);
    assert.equal(result.snapshot.data.filings.length, 2);
    assert.deepEqual(result.snapshot.data.sourceDocuments.map(row => [row.id, row.filingId]), [
      ["document-a", "filing-a"], ["document-b", "filing-a"], ["document-c", "filing-b"],
    ]);
    assert.deepEqual(result.checksumManifest.documents, [{ sha256: checksum, byteSize: 123, mediaType: "application/pdf", sourceDocumentIds: ["document-a", "document-b", "document-c"] }]);
    await db.update(schema.sourceDocuments).set({ byteSize: 124 }).where(eq(schema.sourceDocuments.id, "document-c"));
    await assert.rejects(exportPublicSnapshot(db), /conflicting file metadata/);
  } finally { await close(); }
});

test("public eligibility excludes disputed identity and unverified records but preserves date disputes and citations", async () => {
  const { db, close } = await setup();
  try {
    await db.update(schema.tenures).set({ verificationStatus: "disputed", disputedFacts: ["office"] }).where(eq(schema.tenures.personId, "person-a"));
    await db.update(schema.tenures).set({ verificationStatus: "disputed", disputedFacts: ["startDate"] }).where(eq(schema.tenures.personId, "person-b"));
    const result = await exportPublicSnapshot(db);
    assert.deepEqual(result.snapshot.data.people.map(row => row.id), ["person-b"]);
    assert.deepEqual(result.snapshot.data.tenures[0].disputedFacts, ["startDate"]);
    assert.equal(result.snapshot.data.citations.length, 1);
    assert.equal(result.snapshot.data.tenureCitations[0].citationId, "citation-person-b");
    assert.deepEqual(result.snapshot.data.filings, []);
    assert.deepEqual(result.snapshot.data.sourceDocuments, []);
    assert.deepEqual(result.checksumManifest.documents, []);
    assert.doesNotMatch(result.snapshotJson, /person-a|filing-a|document-a/);
    await db.update(schema.tenures).set({ verificationStatus: "unverified", disputedFacts: [] }).where(eq(schema.tenures.personId, "person-b"));
    const empty = await exportPublicSnapshot(db);
    assert.ok(Object.values(empty.snapshot.data).every(rows => rows.length === 0));
    assert.deepEqual(await exportPublicSnapshot(db), empty);
  } finally { await close(); }
});

test("private queue, Source Tip, and internal review changes cannot enter or change the public artifacts", async () => {
  const { db, client, close } = await setup();
  try {
    const before = await exportPublicSnapshot(db);
    await client.execute("CREATE TABLE source_tips (id TEXT PRIMARY KEY, contact TEXT, explanation TEXT)");
    await client.execute("CREATE TABLE unverified_queue (id TEXT PRIMARY KEY, payload TEXT)");
    await client.execute({ sql: "INSERT INTO source_tips VALUES (?, ?, ?)", args: ["tip-private", privateCanary, "Private explanation"] });
    await client.execute({ sql: "INSERT INTO unverified_queue VALUES (?, ?)", args: ["queue-private", privateCanary] });
    await db.update(schema.people).set({ reviewedBy: "Different private actor", reviewedAt: "2026-09-27" });
    const after = await exportPublicSnapshot(db);
    assert.deepEqual(after, before);
    assert.ok(!after.snapshotJson.includes(privateCanary));
    assert.doesNotMatch(after.snapshotJson, /Private explanation|source_tips|unverified_queue|tip-private|queue-private/);
  } finally { await close(); }
});
