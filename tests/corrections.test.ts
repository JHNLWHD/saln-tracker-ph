import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { TransactionMode } from "@libsql/client";
import { eq } from "drizzle-orm";
import type { Citation, CorrectionChanges, CorrectionTargetType } from "../app/archive/types";
import { connectArchive } from "../app/db/client.server";
import { personIsEligible } from "../app/db/eligibility";
import { applyReviewedManifest, validateReviewedManifest, type ReviewedManifest } from "../app/db/manifests.server";
import { createDbArchive, importReviewedPerson } from "../app/db/people.server";
import { editorialCorrections, filings, manifestApplications, people, sourceDocuments, tenureCitations, tenures } from "../app/db/schema";
import { createLocalDocumentStorage } from "../app/storage/objects.server";
import { migrateArchive, rollbackArchive } from "../scripts/migrate";

const bytes = Buffer.from("%PDF-1.7\nSynthetic correction test document.\n%%EOF\n");
const review = { reviewedAt: "2026-09-25", reviewedBy: "Synthetic reviewer" };
const source = (id: string, supports: string[]): Citation => ({ id, title: "Synthetic evidence", url: `https://example.org/${id}`, publisher: "Test publisher", type: "official_record", supports, publishedDate: null });
const person: ReviewedManifest & { kind: "person" } = {
  id: "person:original", version: 1, kind: "person", payload: {
    review, person: { id: "person", slug: "synthetic", canonicalName: "Test Person", nameVariants: [] },
    jurisdictions: [], jurisdictionRelationships: [], constituencies: [], electoralTerms: [],
    offices: [{ id: "office", name: "Synthetic office", kind: "elected", included: true, jurisdictionId: null }],
    tenures: [{ id: "tenure", personId: "person", officeId: "office", constituencyId: null, electoralTermId: null,
      startDate: null, endDate: null, assumptionMethod: "unknown", verificationStatus: "verified", disputedFacts: [], citations: [source("original", ["person", "office"])] }],
  },
};
const filing: ReviewedManifest & { kind: "filing" } = {
  id: "filing:original", version: 1, kind: "filing", payload: {
    review, filing: { id: "filing", personId: "person", filerName: "PERSON, TEST", reportingDate: { value: "2024", precision: "year" }, executionDate: null, receiptDate: null, supersedesFilingId: null },
    document: { id: "document", filingId: "filing", fileName: "test.pdf", mediaType: "application/pdf", byteSize: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"), originalUrl: "https://example.org/test.pdf", provenanceType: "official_download", provenanceNote: "Synthetic data only.",
      officialReleaseDate: null, acquisitionDate: { value: "2026-09-25", precision: "day" }, archivePublicationDate: "2026-09-25T12:00:00.000Z", transcriptionLevel: "document_only" },
  },
};
function correction(id: string, type: CorrectionTargetType, targetId: string, changes: CorrectionChanges, supports = Object.keys(changes), previousCorrectionId: string | null = null): ReviewedManifest & { kind: "correction" } {
  return { id, version: 1, kind: "correction", payload: {
    review: { reviewedAt: "2026-09-26", reviewedBy: "Synthetic correction reviewer" }, reason: "A reviewed source corrects the recorded fact.",
    target: { type, id: targetId }, previousCorrectionId, changes, citations: [source(`source-${id}`, supports)],
  } };
}
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "saln-corrections-"));
  const connection = connectArchive({ url: `file:${join(directory, "archive.db")}` });
  await migrateArchive(connection.db);
  const storage = createLocalDocumentStorage(join(directory, "objects"));
  await applyReviewedManifest(connection.db, person);
  await applyReviewedManifest(connection.db, filing, { bytes, storage });
  return { ...connection, storage, archive: createDbArchive(connection.db), async close() { connection.client.close(); await rm(directory, { recursive: true, force: true }); } };
}

test('later Source Documents keep their own first applied review date during correction', async () => {
  const state = await setup();
  try {
    const later = structuredClone(filing);
    later.id = 'filing:later-page'; later.payload.document.id = 'later-page';
    later.payload.review.reviewedAt = '2026-09-28';
    later.payload.document.archivePublicationDate = '2026-09-30T12:00:00.000Z';
    await applyReviewedManifest(state.db, later, { bytes, storage: state.storage });
    const patch = correction('publication', 'source_document', 'later-page', { archivePublicationDate: '2026-09-27T12:00:00.000Z' });
    patch.payload.review.reviewedAt = '2026-10-01';
    await assert.rejects(applyReviewedManifest(state.db, patch), /reviewed before publication/);
    const repeated = structuredClone(later);
    repeated.id = 'filing:another-review'; repeated.payload.review.reviewedAt = '2026-09-30';
    await applyReviewedManifest(state.db, repeated, { bytes, storage: state.storage });
    patch.payload.changes.archivePublicationDate = '2026-09-29T12:00:00.000Z';
    await applyReviewedManifest(state.db, patch);
    assert.equal((await applyReviewedManifest(state.db, patch)).status, 'unchanged');
    assert.equal((await state.db.select().from(filings))[0].reviewedAt, review.reviewedAt);
  } finally { await state.close(); }
});

test('pre-ledger People and Tenures must be adopted before a correction', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'saln-correction-adoption-'));
  const { client, db } = connectArchive({ url: `file:${join(directory, 'archive.db')}` });
  try {
    await migrateArchive(db); await importReviewedPerson(db, person.payload);
    const changes = [correction('name-adoption', 'person', 'person', { canonicalName: 'Reviewed name' }), correction('tenure-adoption', 'tenure', 'tenure', { startDate: { value: '2020', precision: 'year' } })];
    for (const patch of changes) await assert.rejects(applyReviewedManifest(db, patch), /applied Person manifest/);
    assert.deepEqual(await db.select().from(manifestApplications), []);
    await applyReviewedManifest(db, person);
    for (const patch of changes) await applyReviewedManifest(db, patch);
  } finally { client.close(); await rm(directory, { recursive: true, force: true }); }
});

test("corrections project current metadata and history while original manifests and bytes replay unchanged", async () => {
  const state = await setup();
  try {
    const before = { people: await state.db.select().from(people), filings: await state.db.select().from(filings), documents: await state.db.select().from(sourceDocuments), tenures: await state.db.select().from(tenures), supports: await state.db.select().from(tenureCitations) };
    const execution = correction("execution", "filing", "filing", { executionDate: { value: "2025-04-10", precision: "day" } });
    const receipt = correction("receipt", "filing", "filing", { receiptDate: { value: "2025-04", precision: "month" } }, ["receiptDate"], "execution");
    const provenance = correction("provenance", "source_document", "document", { provenanceNote: "Corrected custody note.", fileName: "corrected.pdf" });
    const name = correction("name", "person", "person", { canonicalName: "Corrected Test Person", nameVariants: ["Test Person"] });
    for (const manifest of [execution, receipt, provenance, name]) assert.equal((await applyReviewedManifest(state.db, manifest)).status, "applied");
    const profile = await state.archive.findPersonBySlug("synthetic");
    assert.equal(profile?.person.canonicalName, "Corrected Test Person");
    assert.deepEqual(profile?.person.nameVariants, ["Test Person"]);
    assert.deepEqual(profile?.filings[0].executionDate, { value: "2025-04-10", precision: "day" });
    assert.deepEqual(profile?.filings[0].receiptDate, { value: "2025-04", precision: "month" });
    assert.equal((await state.archive.findSourceDocument(filing.payload.document.sha256))?.fileName, "corrected.pdf");
    const history = profile?.editorialCorrections ?? [];
    assert.equal(history.length, 4);
    assert.deepEqual(history.find(row => row.id === "execution")?.previousValues, { executionDate: null });
    assert.equal(history.find(row => row.id === "receipt")?.revision, 2);
    assert.equal(JSON.stringify(history).includes("Synthetic correction reviewer"), false);
    const ledger = await state.db.select().from(manifestApplications);
    for (const manifest of [execution, receipt, provenance, name, person]) assert.equal((await applyReviewedManifest(state.db, manifest)).status, "unchanged");
    assert.equal((await applyReviewedManifest(state.db, filing, { bytes, storage: state.storage })).status, "unchanged");
    const laterNames = structuredClone(person);
    laterNames.id = "person:later-name";
    laterNames.payload.person.nameVariants.push("An additional spelling");
    await assert.rejects(applyReviewedManifest(state.db, laterNames), /add names through a new correction/);
    assert.equal((await applyReviewedManifest(state.db, name)).status, "unchanged");
    assert.deepEqual(await state.db.select().from(manifestApplications), ledger);
    assert.deepEqual(await state.db.select().from(people), before.people);
    assert.deepEqual(await state.db.select().from(filings), before.filings);
    assert.deepEqual(await state.db.select().from(sourceDocuments), before.documents);
    assert.deepEqual(await state.db.select().from(tenures), before.tenures);
    assert.deepEqual(await state.db.select().from(tenureCitations), before.supports);
    assert.deepEqual(Buffer.from((await state.storage.get(filing.payload.document.sha256))!), bytes);
    await assert.rejects(applyReviewedManifest(state.db, { ...execution, payload: { ...execution.payload, reason: "Changed content" } }), /different content/);
    await assert.rejects(applyReviewedManifest(state.db, correction("stale", "filing", "filing", { filerName: "Another spelling" })), /predecessor/);
  } finally { await state.close(); }
});

test("canonical Archive reads request native read transactions while imports retain write mode", async () => {
  const state = await setup();
  const transaction = state.client.transaction.bind(state.client);
  const modes: (TransactionMode | undefined)[] = [];
  state.client.transaction = (mode?: TransactionMode) => { modes.push(mode); return transaction(mode); };
  try {
    await state.archive.listPeople();
    await state.archive.findPersonBySlug("synthetic");
    await state.archive.findSourceDocument(filing.payload.document.sha256);
    assert.deepEqual(modes, ["read", "read", "read"]);
    await applyReviewedManifest(state.db, correction("mode", "person", "person", { canonicalName: "Corrected Person" }));
    assert.deepEqual(modes, ["read", "read", "read", undefined]);
  } finally { await state.close(); }
});

test("effective disputes control SQL eligibility and document reads while all contradictory citations remain", async () => {
  const state = await setup();
  try {
    await applyReviewedManifest(state.db, correction("private-filing-history", "filing", "filing", { filerName: "Corrected filer name" }));
    await applyReviewedManifest(state.db, correction("private-document-history", "source_document", "document", { fileName: "corrected-source.pdf" }));
    const disputed = correction("dispute", "tenure", "tenure", { verificationStatus: "disputed", disputedFacts: ["office"] }, ["person", "office"]);
    await applyReviewedManifest(state.db, disputed);
    assert.deepEqual(await state.db.select().from(people).where(personIsEligible()), []);
    assert.deepEqual(await state.archive.listPeople(), []);
    assert.equal(await state.archive.findSourceDocument(filing.payload.document.sha256), null);
    let profile = await state.archive.findPersonBySlug("synthetic");
    assert.equal(profile?.person.eligibility, "disputed");
    assert.equal(profile?.tenures[0].citations.length, 2);
    assert.deepEqual(profile?.filings, []);
    assert.deepEqual(profile?.editorialCorrections?.map(row => row.target.type), ["tenure"]);
    assert.equal((await state.db.select().from(sourceDocuments)).length, 1);
    const newPage = structuredClone(filing);
    newPage.id = "filing:after-dispute";
    newPage.payload.document.id = "page-after-dispute";
    await assert.rejects(applyReviewedManifest(state.db, newPage, { bytes, storage: state.storage }), /Archive-Eligible/);
    const unrelated = correction("unrelated", "tenure", "tenure", { disputedFacts: [] }, ["startDate"], "dispute");
    await assert.rejects(applyReviewedManifest(state.db, unrelated), /resolution evidence/);
    const dateDispute = correction("date-dispute", "tenure", "tenure", { disputedFacts: ["startDate"] }, ["office", "startDate"], "dispute");
    await applyReviewedManifest(state.db, dateDispute);
    assert.equal((await state.db.select().from(people).where(personIsEligible())).length, 1);
    assert.equal((await state.archive.listPeople()).length, 1);
    assert.ok(await state.archive.findSourceDocument(filing.payload.document.sha256));
    assert.equal((await state.archive.findPersonBySlug("synthetic"))?.editorialCorrections?.filter(row => ["filing", "source_document"].includes(row.target.type)).length, 2);
    // A later patch of another field must not hide the prior effective disputed facts.
    await applyReviewedManifest(state.db, correction("date", "tenure", "tenure", { startDate: { value: "2020", precision: "year" } }, ["startDate"], "date-dispute"));
    profile = await state.archive.findPersonBySlug("synthetic");
    assert.equal(profile?.person.eligibility, "eligible");
    assert.deepEqual(profile?.tenures[0].disputedFacts, ["startDate"]);
    assert.equal(profile?.tenures[0].citations.length, 4);
    assert.equal(profile?.tenures[0].endDate, null);
    assert.equal((await applyReviewedManifest(state.db, disputed)).status, "unchanged");
    assert.equal((await applyReviewedManifest(state.db, person)).status, "unchanged");
    const moreEvidence = correction("additional-evidence", "tenure", "tenure", { disputedFacts: ["startDate"] }, ["startDate"], "date");
    await applyReviewedManifest(state.db, moreEvidence);
    assert.equal((await state.archive.findPersonBySlug("synthetic"))?.tenures[0].citations.length, 5);
    assert.equal((await applyReviewedManifest(state.db, moreEvidence)).status, "unchanged");
    const noChange = { ...moreEvidence, id: "no-change", payload: { ...moreEvidence.payload, previousCorrectionId: "additional-evidence" } };
    await assert.rejects(applyReviewedManifest(state.db, noChange), /does not change/);
    const laterCitation = structuredClone(person);
    laterCitation.id = "person:later-citation";
    laterCitation.payload.tenures[0].citations.push(moreEvidence.payload.citations[0]);
    await applyReviewedManifest(state.db, laterCitation);
    assert.equal((await applyReviewedManifest(state.db, moreEvidence)).status, "unchanged");
    assert.equal((await applyReviewedManifest(state.db, person)).status, "unchanged");
  } finally { await state.close(); }
});

test("a second verified elected Tenure remains an eligibility basis when one Office is disputed", async () => {
  const state = await setup();
  try {
    const second = structuredClone(person);
    second.id = "person:second-tenure";
    second.payload.tenures.push({ ...second.payload.tenures[0], id: "tenure-2", citations: [source("second-office", ["person", "office"])] });
    await applyReviewedManifest(state.db, second);
    await applyReviewedManifest(state.db, correction("one-office-disputed", "tenure", "tenure", { verificationStatus: "disputed", disputedFacts: ["office"] }, ["person", "office"]));
    assert.equal((await state.db.select().from(people).where(personIsEligible())).length, 1);
    const profile = await state.archive.findPersonBySlug("synthetic");
    assert.equal(profile?.person.eligibility, "eligible");
    assert.equal(profile?.tenures.length, 2);
    assert.ok(await state.archive.findSourceDocument(filing.payload.document.sha256));
  } finally { await state.close(); }
});

test("unknown correction input cannot rewrite identity, evidence bytes, source keys, or unsupported facts", () => {
  const valid = correction("test", "source_document", "document", { provenanceNote: "A corrected source note" });
  for (const changes of [{ sha256: "a".repeat(64) }, { id: "new-id" }, { filingId: "other" }, { byteSize: 1 }, { mediaType: "image/png" }, { storageKey: "other" }, { transcriptionLevel: "summary_totals" }, { provenanceType: "rumour" }, { acquisitionDate: null }, { archivePublicationDate: "2026-09-26" }, { originalUrl: "https://user:password@example.org" }, {}]) {
    assert.throws(() => validateReviewedManifest({ ...valid, payload: { ...valid.payload, changes } }));
  }
  for (const changes of [{ officeId: "another" }, { personId: "another" }, { startDate: { value: "2020-01-01", precision: "year" } }, { disputedFacts: ["reputation"] }, { verificationStatus: "probably" }]) {
    assert.throws(() => validateReviewedManifest({ ...valid, payload: { ...valid.payload, target: { type: "tenure", id: "tenure" }, changes } }));
  }
  assert.throws(() => validateReviewedManifest({ ...valid, payload: { ...valid.payload, privateContact: "do not publish" } }));
  assert.throws(() => validateReviewedManifest({ ...valid, payload: { ...valid.payload, citations: [] } }));
});

test("correction failure rolls back its ledger and checks source identity in both import directions", async () => {
  const state = await setup();
  try {
    const manifest = correction("transaction", "filing", "filing", { executionDate: { value: "2025", precision: "year" } });
    await state.client.execute("CREATE TRIGGER reject_correction BEFORE INSERT ON editorial_corrections BEGIN SELECT RAISE(ABORT, 'synthetic correction failure'); END");
    await assert.rejects(applyReviewedManifest(state.db, manifest));
    assert.deepEqual(await state.db.select().from(editorialCorrections), []);
    assert.equal((await state.db.select().from(manifestApplications)).length, 2);
    await state.client.execute("DROP TRIGGER reject_correction");
    await applyReviewedManifest(state.db, manifest);
    const conflicting = correction("source-conflict", "tenure", "tenure", { startDate: { value: "2020", precision: "year" } });
    conflicting.payload.citations = [{ ...source("original", ["startDate"]), publisher: "A different publisher" }];
    await assert.rejects(applyReviewedManifest(state.db, conflicting), /immutable metadata/);
    const personWithCollision = structuredClone(person);
    personWithCollision.id = "person:later";
    personWithCollision.payload.tenures[0].citations.push({ ...source("source-transaction", ["person", "office"]), title: "Different source sharing an ID" });
    await assert.rejects(applyReviewedManifest(state.db, personWithCollision), /immutable metadata/);
    await assert.rejects(applyReviewedManifest(state.db, correction("missing", "person", "unknown", { canonicalName: "Missing" })), /does not exist/);
    await assert.rejects(applyReviewedManifest(state.db, correction("future-acquisition", "source_document", "document", { acquisitionDate: { value: "2027", precision: "year" } })), /before its Acquisition Date/);
    await state.db.update(editorialCorrections).set({ reason: "Out-of-band drift" }).where(eq(editorialCorrections.id, manifest.id));
    await assert.rejects(applyReviewedManifest(state.db, manifest), /differs/);
    assert.equal((await state.db.select().from(manifestApplications)).length, 3);
  } finally { await state.close(); }
});

test("migration preserves the existing ledger and can reverse populated correction history", async () => {
  const directory = await mkdtemp(join(tmpdir(), "saln-correction-migration-"));
  const { client, db } = connectArchive({ url: `file:${join(directory, "archive.db")}` });
  try {
    for (const name of ["0000_archive_identity.sql", "0001_filing_documents.sql", "0002_reviewed_manifests.sql"]) {
      await client.batch((await readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8")).split("--> statement-breakpoint").map(sql => sql.trim()).filter(Boolean), "write");
    }
    const prior = { id: "legacy-ledger", kind: "person" as const, version: 1, digest: "a".repeat(64), canonicalPayload: "{}", appliedAt: "2026-09-25T00:00:00.000Z" };
    await db.insert(manifestApplications).values(prior);
    await client.batch((await readFile(new URL("../drizzle/0003_editorial_corrections.sql", import.meta.url), "utf8")).split("--> statement-breakpoint").map(sql => sql.trim()).filter(Boolean), "write");
    assert.deepEqual(await db.select().from(manifestApplications), [prior]);
    await applyReviewedManifest(db, person);
    await applyReviewedManifest(db, correction("name-1", "person", "person", { canonicalName: "First correction" }));
    await applyReviewedManifest(db, correction("name-2", "person", "person", { canonicalName: "Second correction" }, ["canonicalName"], "name-1"));
    const down = await readFile(new URL("../drizzle/0003_down.sql", import.meta.url), "utf8");
    await client.batch(down.split(";").map(sql => sql.trim()).filter(Boolean), "write");
    assert.equal((await db.select().from(manifestApplications)).length, 2);
    await assert.rejects(db.select().from(editorialCorrections));
    // Restore this migration before the complete local rollback.
    await client.batch((await readFile(new URL("../drizzle/0003_editorial_corrections.sql", import.meta.url), "utf8")).split("--> statement-breakpoint").map(sql => sql.trim()).filter(Boolean), "write");
    await client.execute("CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC)");
    await rollbackArchive(client);
    await migrateArchive(db);
    assert.deepEqual(await db.select().from(editorialCorrections), []);
  } finally { client.close(); await rm(directory, { recursive: true, force: true }); }
});
