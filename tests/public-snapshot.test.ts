import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { eq } from "drizzle-orm";
import { exportPublicSnapshot } from "../app/archive/snapshot.server";
import type { CorrectionChanges, EditorialCorrection } from "../app/archive/types";
import { connectArchive } from "../app/db/client.server";
import { applyReviewedManifest, manifestDigest, validateReviewedManifest } from "../app/db/manifests.server";
import { canonicalJson } from '../app/db/canonical';
import * as schema from "../app/db/schema";
import { parsePartialDate, type ReviewedPerson } from "../app/db/validation";
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
  for (const id of ids) await applyReviewedManifest(connection.db, { id: `person:${id}`, kind: 'person', version: 1, payload: person(id, reverse) });
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
  // These SQL projection fixtures include the immutable review for each Source Document.
  for (const { storageKey: _key, ...document } of documents) {
    const { reviewedAt, reviewedBy, ...filing } = filingRows.find(row => row.id === document.filingId)!;
    const manifest = validateReviewedManifest({ id: `source:${document.id}`, kind: 'filing', version: 1, payload: {
      review: { reviewedAt, reviewedBy },
      filing: { ...filing, reportingDate: parsePartialDate(filing.reportingDate), executionDate: parsePartialDate(filing.executionDate) },
      document: { ...document, acquisitionDate: parsePartialDate(document.acquisitionDate) },
    } });
    await connection.db.insert(schema.manifestApplications).values({ id: manifest.id, version: manifest.version, kind: manifest.kind, digest: manifestDigest(manifest), canonicalPayload: canonicalJson(manifest), appliedAt: '2026-09-26T10:00:00.000Z' });
  }
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
    assert.doesNotMatch(result.snapshotJson, /storageKey|reviewedBy|generatedAt|private-reviewer/);
    assert.deepEqual(result.snapshot.data.financialSummaries, []);
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

function correction(id: string, target: EditorialCorrection["target"], changes: CorrectionChanges, previousCorrectionId: string | null = null) {
  const supports = [...new Set([
    ...Object.keys(changes).filter(field => field !== "verificationStatus" && field !== "disputedFacts"),
    ...(changes.verificationStatus ? ["person", "office"] : []), ...(changes.disputedFacts ?? []),
  ])];
  return { id, version: 1, kind: "correction", payload: {
    review: { reviewedAt: "2026-09-27", reviewedBy: privateCanary }, reason: `Reviewed correction ${id}.`, target, previousCorrectionId, changes,
    citations: [{ id: `citation-${id}`, title: `Correction evidence ${id}`, url: `https://example.org/${id}`, publisher: "Test Publisher", type: "public_article", publishedDate: null, supports }],
  } };
}

test("snapshot projects reviewed corrections and their history without changing original Filings or Source Documents", async () => {
  const { db, close } = await setup();
  try {
    const before = await exportPublicSnapshot(db);
    const originalFilings = await db.select().from(schema.filings);
    const originalDocuments = await db.select().from(schema.sourceDocuments);
    const manifests = [
      correction("correct-person", { type: "person", id: "person-a" }, { canonicalName: "Corrected Person", nameVariants: ["Older name", "Alternate name"] }),
      correction("correct-filing", { type: "filing", id: "filing-a" }, { reportingDate: { value: "2023-12", precision: "month" } }),
      correction("correct-provenance", { type: "source_document", id: "document-a" }, { provenanceNote: "Corrected public custody description." }),
      correction("correct-tenure", { type: "tenure", id: "tenure-person-a" }, { startDate: null, verificationStatus: "disputed", disputedFacts: ["startDate"] }),
    ];
    for (const manifest of manifests) await applyReviewedManifest(db, manifest);
    const result = await exportPublicSnapshot(db);
    assert.notEqual(result.snapshot.version, before.snapshot.version);
    assert.equal(result.snapshot.data.people[0].canonicalName, "Corrected Person");
    assert.deepEqual(result.snapshot.data.personNames.filter(row => row.personId === "person-a").map(row => row.value), ["Alternate name", "Older name"]);
    assert.deepEqual(result.snapshot.data.filings[0].reportingDate, { value: "2023-12", precision: "month" });
    assert.equal(result.snapshot.data.sourceDocuments[0].provenanceNote, "Corrected public custody description.");
    assert.equal(result.snapshot.data.tenures[0].startDate, null);
    assert.equal(result.snapshot.data.tenures[0].verificationStatus, "disputed");
    assert.deepEqual(result.snapshot.data.tenureCitations.filter(row => row.tenureId === "tenure-person-a").map(row => row.citationId), ["citation-correct-tenure", "citation-person-a"]);
    assert.ok(result.snapshot.data.citations.some(row => row.id === "citation-correct-tenure"));
    assert.equal(result.snapshot.data.editorialCorrections.length, 4);
    assert.equal(result.snapshot.data.editorialCorrections[0].reason, "Reviewed correction correct-filing.");
    assert.deepEqual(result.snapshot.data.editorialCorrections[0].previousValues, { reportingDate: { value: "2024", precision: "year" } });
    assert.deepEqual(result.checksumManifest.documents, before.checksumManifest.documents);
    assert.deepEqual(await db.select().from(schema.filings), originalFilings);
    assert.deepEqual(await db.select().from(schema.sourceDocuments), originalDocuments);
    assert.doesNotMatch(result.snapshotJson, /reviewedBy|private-reviewer|canonicalPayload|appliedAt/);
    for (const manifest of manifests) assert.equal((await applyReviewedManifest(db, manifest)).status, "unchanged");
    assert.deepEqual(await exportPublicSnapshot(db), result);
  } finally { await close(); }
});

test("corrected sole Office disputes filter snapshots until a reviewed resolution, preserving all citations afterward", async () => {
  const { db, close } = await setup();
  try {
    await applyReviewedManifest(db, correction("dispute-office", { type: "tenure", id: "tenure-person-a" }, { verificationStatus: "disputed", disputedFacts: ["office"] }));
    const disputed = await exportPublicSnapshot(db);
    assert.deepEqual(disputed.snapshot.data.people.map(row => row.id), ["person-b"]);
    assert.deepEqual(disputed.snapshot.data.filings, []);
    assert.deepEqual(disputed.checksumManifest.documents, []);
    assert.doesNotMatch(disputed.snapshotJson, /person-a|dispute-office|document-a/);
    await applyReviewedManifest(db, correction("resolve-office", { type: "tenure", id: "tenure-person-a" }, { verificationStatus: "verified", disputedFacts: [] }, "dispute-office"));
    const resolved = await exportPublicSnapshot(db);
    assert.deepEqual(resolved.snapshot.data.people.map(row => row.id), ["person-a", "person-b"]);
    assert.equal(resolved.snapshot.data.filings.length, 2);
    assert.deepEqual(resolved.snapshot.data.tenureCitations.filter(row => row.tenureId === "tenure-person-a").map(row => row.citationId), ["citation-dispute-office", "citation-person-a", "citation-resolve-office"]);
    assert.equal(resolved.snapshot.data.editorialCorrections.length, 2);
    assert.equal(resolved.checksumManifest.documents[0].sha256, checksum);
  } finally { await close(); }
});
