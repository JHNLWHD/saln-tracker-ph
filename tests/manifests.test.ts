import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { eq } from "drizzle-orm";
import { connectArchive } from "../app/db/client.server";
import { applyReviewedManifest, manifestDigest, validateReviewedManifest, type ReviewedManifest } from "../app/db/manifests.server";
import { importReviewedPerson } from "../app/db/people.server";
import { importReviewedFiling } from "../app/db/filings.server";
import { filings, manifestApplications, people, personNames, sourceDocuments } from "../app/db/schema";
import { createLocalDocumentStorage, type DocumentStorage } from "../app/storage/objects.server";
import { migrateArchive } from "../scripts/migrate";

const firstBytes = Buffer.from("%PDF-1.7\nSynthetic declaration page 1.\n%%EOF\n");
const review = { reviewedAt: "2026-09-26", reviewedBy: "Synthetic test reviewer" };

function personManifest(): ReviewedManifest & { kind: "person" } {
  return { id: "person:synthetic-1", version: 1, kind: "person", payload: {
    review, person: { id: "person-1", slug: "sample-person", canonicalName: "Sample Person", nameVariants: ["Person, Sample"] },
    jurisdictions: [], jurisdictionRelationships: [], constituencies: [], electoralTerms: [],
    offices: [{ id: "office-1", name: "Test elected office", kind: "elected", included: true, jurisdictionId: null }],
    tenures: [{ id: "tenure-1", personId: "person-1", officeId: "office-1", constituencyId: null, electoralTermId: null, startDate: null, endDate: null, assumptionMethod: "unknown", verificationStatus: "verified", disputedFacts: [],
      citations: [{ id: "citation-1", title: "Synthetic test source", url: "https://example.org/test", publisher: "Test Publisher", type: "public_article", supports: ["person", "office"], publishedDate: null }],
    }],
  } };
}

function filingManifest(id = "page-1", bytes = firstBytes): ReviewedManifest & { kind: "filing" } {
  return { id: `filing:${id}`, version: 1, kind: "filing", payload: {
    review,
    filing: { id: "filing-1", personId: "person-1", filerName: "PERSON, SAMPLE", reportingDate: { value: "2020", precision: "year" }, executionDate: null, receiptDate: null, supersedesFilingId: null },
    document: { id, filingId: "filing-1", fileName: `${id}.pdf`, mediaType: "application/pdf", byteSize: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex"), originalUrl: "https://example.org/synthetic.pdf", provenanceType: "official_download", provenanceNote: "Synthetic test only.", officialReleaseDate: null, acquisitionDate: { value: "2026-09-26", precision: "day" }, archivePublicationDate: "2026-09-26T01:23:45.000Z", transcriptionLevel: "document_only" },
  } };
}

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "saln-manifests-test-"));
  const connection = connectArchive({ url: `file:${join(directory, "archive.db")}` });
  await migrateArchive(connection.db);
  const local = createLocalDocumentStorage(join(directory, "objects"));
  let puts = 0;
  const storage: DocumentStorage = { get: local.get, async put(...args) { puts++; return local.put(...args); } };
  return { ...connection, storage, get puts() { return puts; }, async close() { connection.client.close(); await rm(directory, { recursive: true, force: true }); } };
}

test("canonical manifest reruns verify saved rows and bytes without ledger or object writes", async () => {
  const state = await setup();
  try {
    const person = personManifest();
    assert.equal((await applyReviewedManifest(state.db, person)).status, "applied");
    const filing = filingManifest();
    assert.equal((await applyReviewedManifest(state.db, filing, { bytes: firstBytes, storage: state.storage })).status, "applied");
    const before = await state.db.select().from(manifestApplications);
    const reordered = { payload: person.payload, kind: person.kind, version: person.version, id: person.id };
    assert.equal(manifestDigest(validateReviewedManifest(reordered)), manifestDigest(person));
    assert.equal((await applyReviewedManifest(state.db, reordered)).status, "unchanged");
    assert.equal((await applyReviewedManifest(state.db, filing, { bytes: firstBytes, storage: state.storage })).status, "unchanged");
    assert.deepEqual(await state.db.select().from(manifestApplications), before);
    assert.equal(state.puts, 1);
    for (const change of [{ reviewedAt: '2026-09-25' }, { reviewedBy: 'Out-of-band reviewer' }]) {
      await state.db.update(filings).set(change).where(eq(filings.id, 'filing-1'));
      await assert.rejects(applyReviewedManifest(state.db, filing, { bytes: firstBytes, storage: state.storage }), /different metadata/);
      await state.db.update(filings).set(review).where(eq(filings.id, 'filing-1'));
    }
    await assert.rejects(applyReviewedManifest(state.db, { ...person, payload: { ...person.payload, person: { ...person.payload.person, canonicalName: "Changed Name" } } }), /different content/);
    await state.db.delete(personNames).where(eq(personNames.personId, "person-1"));
    await assert.rejects(applyReviewedManifest(state.db, person), /missing from an applied manifest/);
    assert.deepEqual(await state.db.select().from(personNames), []);
    const missing: DocumentStorage = { get: async () => null, put: state.storage.put };
    await assert.rejects(applyReviewedManifest(state.db, filing, { bytes: firstBytes, storage: missing }), /bytes are missing/);
    assert.equal(state.puts, 1);
    await state.db.update(sourceDocuments).set({ provenanceNote: "Out-of-band change" }).where(eq(sourceDocuments.id, "page-1"));
    await assert.rejects(applyReviewedManifest(state.db, filing, { bytes: firstBytes, storage: state.storage }), /different metadata/);
  } finally { await state.close(); }
});

test("new pages share one Filing, exact copies share a checksum, and distinct declarations remain distinct", async () => {
  const state = await setup();
  try {
    await applyReviewedManifest(state.db, personManifest());
    const page2 = Buffer.from("%PDF-1.7\nSynthetic declaration page 2.\n%%EOF\n");
    const later = filingManifest('page-2', page2);
    later.payload.review = { reviewedAt: '2026-09-27', reviewedBy: 'Later Document reviewer' };
    later.payload.document.archivePublicationDate = '2026-09-27T12:00:00.000Z';
    for (const [manifest, bytes] of [[filingManifest(), firstBytes], [later, page2], [filingManifest("page-1-copy"), firstBytes]] as const) {
      await applyReviewedManifest(state.db, manifest, { bytes, storage: state.storage });
      assert.equal((await applyReviewedManifest(state.db, manifest, { bytes, storage: state.storage })).status, 'unchanged');
    }
    assert.equal((await state.db.select().from(filings)).length, 1);
    assert.equal((await state.db.select().from(sourceDocuments)).length, 3);
    assert.equal(state.puts, 2);
    const anotherBytes = Buffer.from("%PDF-1.7\nA distinct same-period declaration.\n%%EOF\n");
    const another = filingManifest("another-declaration", anotherBytes);
    another.payload.filing.id = "filing-2";
    another.payload.document.filingId = "filing-2";
    await applyReviewedManifest(state.db, another, { bytes: anotherBytes, storage: state.storage });
    assert.equal((await state.db.select().from(filings)).length, 2);
    assert.equal(state.puts, 3);
    const conflicting = filingManifest("conflicting-page", page2);
    conflicting.payload.filing.filerName = "A DIFFERENT FILER";
    await assert.rejects(applyReviewedManifest(state.db, conflicting, { bytes: page2, storage: state.storage }), /different metadata/);
    assert.equal(state.puts, 3);
  } finally { await state.close(); }
});

test("application failure rolls back metadata and ledger; retry reuses the unlisted object", async () => {
  const state = await setup();
  try {
    await applyReviewedManifest(state.db, personManifest());
    await state.client.execute("CREATE TRIGGER reject_test_manifest BEFORE INSERT ON manifest_applications WHEN NEW.kind = 'filing' BEGIN SELECT RAISE(ABORT, 'synthetic ledger failure'); END");
    await assert.rejects(applyReviewedManifest(state.db, filingManifest(), { bytes: firstBytes, storage: state.storage }));
    assert.deepEqual(await state.db.select().from(filings), []);
    assert.deepEqual(await state.db.select().from(sourceDocuments), []);
    assert.equal((await state.db.select().from(manifestApplications)).length, 1);
    await state.client.execute("DROP TRIGGER reject_test_manifest");
    assert.equal((await applyReviewedManifest(state.db, filingManifest(), { bytes: firstBytes, storage: state.storage })).status, "applied");
    assert.equal(state.puts, 1);
  } finally { await state.close(); }
});

test("matching pre-ledger records can be adopted without rewriting source metadata", async () => {
  const state = await setup();
  try {
    const person = personManifest(), filing = filingManifest();
    await importReviewedPerson(state.db, person.payload);
    await importReviewedFiling(state.db, filing.payload, firstBytes, state.storage);
    const differentReview = structuredClone(filing); differentReview.payload.review.reviewedBy = 'Different reviewer';
    await assert.rejects(applyReviewedManifest(state.db, differentReview, { bytes: firstBytes, storage: state.storage }), /different metadata/);
    const before = await state.db.select().from(sourceDocuments);
    assert.equal((await applyReviewedManifest(state.db, person)).status, "applied");
    assert.equal((await applyReviewedManifest(state.db, filing, { bytes: firstBytes, storage: state.storage })).status, "applied");
    assert.deepEqual(await state.db.select().from(sourceDocuments), before);
    assert.equal((await state.db.select().from(people)).length, 1);
    assert.equal(state.puts, 1);
  } finally { await state.close(); }
});

test("manifest validation rejects private fields, fuzzy merges, unsupported dates, statuses, and totals", () => {
  const person = personManifest(), filing = filingManifest();
  const invalid: unknown[] = [
    { ...person, version: 2 }, { ...person, kind: "unverified_submission" }, { ...person, sourceTipContact: "private" },
    { ...person, payload: { ...person.payload, matchByName: true } },
    { ...person, payload: { ...person.payload, person: { ...person.payload.person, fuzzyMerge: "Another Person" } } },
    { ...person, payload: { ...person.payload, tenures: [{ ...person.payload.tenures[0], startDate: { value: "2020-01-01", precision: "day" } }] } },
    { ...filing, payload: { ...filing.payload, filing: { ...filing.payload.filing, status: "submitted" } } },
    { ...filing, payload: { ...filing.payload, financialSummary: { totalAssets: 0 } } },
    { ...filing, payload: { ...filing.payload, document: { ...filing.payload.document, provenanceNote: "" } } },
  ];
  for (const input of invalid) assert.throws(() => validateReviewedManifest(input));
});
