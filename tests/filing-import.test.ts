import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { eq } from "drizzle-orm";
import { createLocalDocumentStorage, type DocumentStorage } from "../app/storage/objects.server";
import { connectArchive } from "../app/db/client.server";
import { importReviewedFiling, findPublicSourceDocument } from "../app/db/filings.server";
import { validateReviewedFiling, type ReviewedFiling } from "../app/db/filing-validation";
import { createDbArchive, importReviewedPerson } from "../app/db/people.server";
import { filings, sourceDocuments, tenures } from "../app/db/schema";
import { migrateArchive } from "../scripts/migrate";

const bytes = Buffer.from("%PDF-1.7\nSynthetic test fixture only.\n%%EOF\n");

function manifest(id = "filing-1", body: Uint8Array = bytes): ReviewedFiling {
  return {
    review: { reviewedAt: "2026-09-26", reviewedBy: "Synthetic test reviewer" },
    filing: { id, personId: "person-1", filerName: "PERSON, SAMPLE", reportingDate: { value: "2020", precision: "year" }, executionDate: { value: "2021-01", precision: "month" }, receiptDate: null, supersedesFilingId: null },
    document: {
      id: `document-${id}`, filingId: id, fileName: "synthetic.pdf", mediaType: "application/pdf", byteSize: body.byteLength,
      sha256: createHash("sha256").update(body).digest("hex"), originalUrl: "https://example.org/synthetic.pdf",
      provenanceType: "official_download", provenanceNote: "Synthetic test provenance; never production evidence.",
      officialReleaseDate: null, acquisitionDate: { value: "2026-09-26", precision: "day" }, archivePublicationDate: "2026-09-26T01:23:45.000Z", transcriptionLevel: "document_only",
    },
  };
}

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "saln-filing-test-"));
  const connection = connectArchive({ url: `file:${join(directory, "archive.db")}` });
  await migrateArchive(connection.db);
  await importReviewedPerson(connection.db, {
    review: { reviewedAt: "2026-09-26", reviewedBy: "Synthetic test reviewer" },
    person: { id: "person-1", slug: "sample-person", canonicalName: "Sample Person", nameVariants: [] },
    jurisdictions: [], jurisdictionRelationships: [], constituencies: [], electoralTerms: [],
    offices: [{ id: "office-1", name: "Test elected office", kind: "elected", included: true, jurisdictionId: null }],
    tenures: [{ id: "tenure-1", personId: "person-1", officeId: "office-1", constituencyId: null, electoralTermId: null, startDate: null, endDate: null, assumptionMethod: "unknown", verificationStatus: "verified", disputedFacts: [],
      citations: [{ id: "citation-1", title: "Synthetic test source", url: "https://example.org/test", publisher: "Test Publisher", type: "public_article", supports: ["person", "office"], publishedDate: null }],
    }],
  });
  return { ...connection, storage: createLocalDocumentStorage(join(directory, "objects")), async close() { connection.client.close(); await rm(directory, { recursive: true, force: true }); } };
}

test("document-only import preserves dates and same-period Filings without absent summary values", async () => {
  const { db, storage, close } = await setup();
  try {
    const first = manifest();
    await importReviewedFiling(db, first, bytes, storage);
    const nextBytes = Buffer.from("%PDF-1.7\nAnother synthetic declaration in the same period.\n%%EOF\n");
    await importReviewedFiling(db, manifest("filing-2", nextBytes), nextBytes, storage);
    const record = await createDbArchive(db).findPersonBySlug("sample-person");
    assert.equal(record?.filings.length, 2);
    assert.deepEqual(record?.filings[0].reportingDate, { value: "2020", precision: "year" });
    assert.deepEqual(record?.filings[0].executionDate, { value: "2021-01", precision: "month" });
    assert.equal(record?.filings[0].receiptDate, null);
    assert.equal(record?.filings[0].filerName, "PERSON, SAMPLE");
    assert.equal(record?.sourceDocuments[0].transcriptionLevel, "document_only");
    assert.equal(record?.sourceDocuments[0].officialReleaseDate, null);
    assert.deepEqual(record?.sourceDocuments[0].acquisitionDate, { value: "2026-09-26", precision: "day" });
    assert.equal(record?.sourceDocuments[0].archivePublicationDate, "2026-09-26T01:23:45.000Z");
    assert.deepEqual(record?.financialSummaries, []);
    assert.deepEqual(Buffer.from((await storage.get(first.document.sha256))!), bytes);
    assert.equal((await findPublicSourceDocument(db, first.document.sha256))?.id, first.document.id);
    await assert.rejects(importReviewedFiling(db, first, bytes, storage), /already exists/);
    assert.equal((await db.select().from(filings)).length, 2);
    assert.deepEqual(Buffer.from((await storage.get(first.document.sha256))!), bytes);
  } finally { await close(); }
});

test("malformed or unreviewed publication metadata fails the manifest boundary", () => {
  const valid = manifest(), document = valid.document, filing = valid.filing;
  const invalid: unknown[] = [
    { ...valid, privateContact: "not public metadata" },
    { ...valid, review: { ...valid.review, reviewedAt: "2026" } },
    { ...valid, review: { ...valid.review, reviewedAt: "2026-09-27" } },
    { ...valid, review: { ...valid.review, reviewedAt: "2026-01-01" } },
    { ...valid, filing: { ...filing, filerName: "" } },
    { ...valid, filing: { ...filing, reportingDate: null } },
    { ...valid, filing: { ...filing, reportingDate: { value: "2020", precision: "day" } } },
    { ...valid, filing: { ...filing, supersedesFilingId: "guessed-prior-filing" } },
    { ...valid, filing: { ...filing, status: "submitted" } },
    { ...valid, document: { ...document, filingId: "wrong-filing" } },
    { ...valid, document: { ...document, fileName: "../source.pdf" } },
    { ...valid, document: { ...document, byteSize: -1 } },
    { ...valid, document: { ...document, sha256: "not-a-checksum" } },
    { ...valid, document: { ...document, mediaType: "text/html" } },
    { ...valid, document: { ...document, provenanceType: "secondary_report" } },
    { ...valid, document: { ...document, provenanceNote: "" } },
    { ...valid, document: { ...document, originalUrl: null } },
    { ...valid, document: { ...document, originalUrl: "https://user:secret@example.org/source.pdf" } },
    { ...valid, document: { ...document, originalUrl: "javascript:alert(1)" } },
    { ...valid, document: { ...document, acquisitionDate: null } },
    { ...valid, document: { ...document, acquisitionDate: { value: "2027", precision: "year" } } },
    { ...valid, document: { ...document, archivePublicationDate: "2026-09-26" } },
    { ...valid, document: { ...document, transcriptionLevel: "summary_totals" } },
    { ...valid, document: { ...document, totalAssets: 0 } },
  ];
  for (const item of invalid) assert.throws(() => validateReviewedFiling(item));
  for (const acquisitionDate of [{ value: '2026', precision: 'year' }, { value: '2026-09', precision: 'month' }]) {
    assert.doesNotThrow(() => validateReviewedFiling({ ...valid, document: { ...document, acquisitionDate } }));
  }
  assert.equal(validateReviewedFiling({ ...valid, document: { ...document, provenanceType: "formal_release", originalUrl: null } }).document.originalUrl, null);
});

test("hash, size, signature, and eligibility failures happen before any object write", async () => {
  const { db, storage, close } = await setup();
  let writes = 0;
  const counted: DocumentStorage = { get: storage.get, async put(...args) { writes++; return storage.put(...args); } };
  try {
    await assert.rejects(importReviewedFiling(db, manifest(), Buffer.from("wrong bytes"), counted), /size or checksum/);
    const html = Buffer.from("<html>Not a Source Document</html>");
    await assert.rejects(importReviewedFiling(db, manifest("bad-signature", html), html, counted), /signature/);
    await db.update(tenures).set({ verificationStatus: "unverified" }).where(eq(tenures.id, "tenure-1"));
    await assert.rejects(importReviewedFiling(db, manifest(), bytes, counted), /Archive-Eligible/);
    assert.equal(writes, 0);
    assert.deepEqual(await db.select().from(filings), []);
  } finally { await close(); }
});

test("a metadata failure rolls back both records and leaves the immutable object unpublished", async () => {
  const { client, db, storage, close } = await setup();
  try {
    await client.execute("CREATE TRIGGER reject_test_document BEFORE INSERT ON source_documents BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END");
    const input = manifest();
    await assert.rejects(importReviewedFiling(db, input, bytes, storage));
    assert.deepEqual(await db.select().from(filings), []);
    assert.deepEqual(await db.select().from(sourceDocuments), []);
    assert.deepEqual(Buffer.from((await storage.get(input.document.sha256))!), bytes);
    assert.equal(await findPublicSourceDocument(db, input.document.sha256), null);
  } finally { await close(); }
});

test("loss of sole eligibility removes document access without deleting preserved evidence", async () => {
  const { db, storage, close } = await setup();
  try {
    const input = manifest();
    await importReviewedFiling(db, input, bytes, storage);
    await db.update(tenures).set({ verificationStatus: "disputed", disputedFacts: ["office"] }).where(eq(tenures.id, "tenure-1"));
    assert.equal(await findPublicSourceDocument(db, input.document.sha256), null);
    assert.deepEqual((await createDbArchive(db).findPersonBySlug("sample-person"))?.sourceDocuments, []);
    assert.equal((await db.select().from(sourceDocuments)).length, 1);
    assert.deepEqual(Buffer.from((await storage.get(input.document.sha256))!), bytes);
  } finally { await close(); }
});

test("original PNG and JPEG scan bytes keep their original media type", async () => {
  const { db, storage, close } = await setup();
  try {
    for (const [type, extension, body] of [
      ["image/png", "png", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1])],
      ["image/jpeg", "jpg", Buffer.from([255, 216, 255, 1])],
    ] as const) {
      const input = manifest(`filing-${extension}`, body);
      input.document.mediaType = type;
      input.document.fileName = `synthetic.${extension}`;
      await importReviewedFiling(db, input, body, storage);
      assert.equal((await findPublicSourceDocument(db, input.document.sha256))?.mediaType, type);
    }
  } finally { await close(); }
});
