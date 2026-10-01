import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { eq } from "drizzle-orm";
import { closeArchive } from "../app/archive/archive.server";
import { exportPublicSnapshot } from "../app/archive/snapshot.server";
import type { Citation } from "../app/archive/types";
import { PersonProfile } from "../app/components/PersonProfile";
import { connectArchive } from "../app/db/client.server";
import type { ReviewedFiling } from "../app/db/filing-validation";
import { importReviewedFiling } from "../app/db/filings.server";
import { legacyDocumentPath, type ReviewedIdentities } from "../app/db/identity-validation";
import { applyReviewedManifest, validateReviewedManifest, type ReviewedManifest } from "../app/db/manifests.server";
import { createDbArchive, importReviewedPerson } from "../app/db/people.server";
import * as schema from "../app/db/schema";
import type { ReviewedPerson } from "../app/db/validation";
import { createLocalDocumentStorage } from "../app/storage/objects.server";
import { migrateArchive } from "../scripts/migrate";

const review = { reviewedAt: "2026-10-02", reviewedBy: "Private synthetic reviewer" };
const citation: Citation = { id: "identity-source", title: "Synthetic identity evidence", url: "https://example.org/identity", publisher: "Test Publisher", type: "public_article", publishedDate: null, supports: ["identity"] };
function person(id: string, eligible = false): ReviewedPerson {
  return { review, person: { id, slug: `profile-${id}`, canonicalName: "Same Name", nameVariants: [`Variant ${id}`] },
    offices: eligible ? [{ id: "office", name: "Test elected Office", kind: "elected", included: true, jurisdictionId: null }] : [],
    jurisdictions: [], jurisdictionRelationships: [], constituencies: [], electoralTerms: [],
    tenures: eligible ? [{ id: `tenure-${id}`, personId: id, officeId: "office", electoralTermId: null, constituencyId: null, startDate: null, endDate: null,
      assumptionMethod: "unknown", verificationStatus: "verified", disputedFacts: [], citations: [{ ...citation, id: `tenure-source-${id}`, supports: ["person", "office"] }] }] : [],
  };
}
function manifest(id: string, payload: Partial<ReviewedIdentities>): ReviewedManifest {
  return { id, version: 1, kind: "identities", payload: { review, legacyPeople: [], matches: [], documents: [], ...payload } };
}
const match = (fromPersonId: string, toPersonId: string) => ({ id: `match-${fromPersonId}-${toPersonId}`, fromPersonId, toPersonId, reason: "Synthetic reviewed identity match.", citations: [citation] });
const legacy = (id: string, slugs: string[] = [], identifiers: string[] = []) => ({ person: person(id).person, slugs, identifiers, sourceUrl: `https://example.org/official/${id}` });
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "saln-identity-test-"));
  const url = `file:${join(directory, "archive.db")}`;
  const connection = connectArchive({ url });
  await migrateArchive(connection.db);
  return { ...connection, url, directory, archive: createDbArchive(connection.db), storage: createLocalDocumentStorage(join(directory, "objects")),
    async close() { connection.client.close(); await rm(directory, { recursive: true, force: true }); } };
}

test("reviewed merge chains retain source rows, dates, correction history, documents and all former keys", async () => {
  const state = await setup();
  const env = { ARCHIVE_ADAPTER: "turso", TURSO_DATABASE_URL: state.url, ARCHIVE_STORAGE: "local", ARCHIVE_OBJECT_DIR: join(state.directory, "objects") };
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  try {
    await importReviewedPerson(state.db, person("a", true));
    await importReviewedPerson(state.db, person("b"));
    await importReviewedPerson(state.db, person("c"));
    assert.deepEqual((await state.archive.listPeople()).map(row => row.person.id), ["a"]); // Names never merge.
    const bytes = Buffer.from("%PDF-1.7\nSynthetic identity test.\n%%EOF\n");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const filing: ReviewedFiling = { review,
      filing: { id: "filing-a", personId: "a", filerName: "EXACT FILER NAME", reportingDate: { value: "2024", precision: "year" }, executionDate: null, receiptDate: null, supersedesFilingId: null },
      document: { id: "document-a", filingId: "filing-a", fileName: "test.pdf", mediaType: "application/pdf", byteSize: bytes.length, sha256,
        originalUrl: "https://example.org/test.pdf", provenanceType: "official_download", provenanceNote: "Synthetic test, not archive evidence.", officialReleaseDate: null,
        acquisitionDate: { value: "2026-10-02", precision: "day" }, archivePublicationDate: "2026-10-02T00:00:00.000Z", transcriptionLevel: "document_only" } };
    await importReviewedFiling(state.db, filing, bytes, state.storage);
    const correction = { id: "name-a", version: 1, kind: "correction", payload: { review, reason: "Synthetic corrected name", target: { type: "person", id: "a" }, previousCorrectionId: null,
      changes: { canonicalName: "Former reviewed name" }, citations: [{ ...citation, supports: ["canonicalName"] }] } };
    await applyReviewedManifest(state.db, correction);
    const originalPeople = await state.db.select().from(schema.people), originalTenures = await state.db.select().from(schema.tenures);
    const originalFilings = await state.db.select().from(schema.filings), originalDocuments = await state.db.select().from(schema.sourceDocuments);
    const first = manifest("a-to-b", { legacyPeople: [legacy("a", ["old-a"], ["former-a"])], matches: [match("a", "b")], documents: [{ path: "/saln/test/a.pdf", sourceDocumentId: "document-a", sha256 }] });
    const second = manifest("b-to-c", { matches: [match("b", "c")] });
    await applyReviewedManifest(state.db, first);
    await applyReviewedManifest(state.db, second);
    assert.deepEqual((await state.archive.listPeople()).map(row => row.person.id), ["c"]); // The former Tenure establishes eligibility.
    for (const key of ["a", "b", "c", "profile-a", "profile-b", "profile-c", "old-a", "former-a"]) assert.equal((await state.archive.findPersonBySlug(key))?.person.id, "c");
    const record = (await state.archive.findPersonBySlug("c"))!;
    assert.deepEqual(record.person.nameVariants, ["Former reviewed name", "Variant a", "Variant b", "Variant c"]);
    assert.equal(record.tenures[0].personId, "c");
    assert.equal(record.tenures[0].endDate, null);
    assert.equal(record.filings[0].personId, "c");
    assert.equal(record.filings[0].filerName, "EXACT FILER NAME");
    assert.equal(record.filings[0].reportingDate.precision, "year");
    assert.equal(record.editorialCorrections?.[0].target.id, "a");
    assert.equal((await state.archive.findSourceDocument(sha256))?.id, "document-a");
    assert.equal((await state.archive.findLegacyDocument("/saln/test/a.pdf"))?.sha256, sha256);
    Object.assign(process.env, env);
    const { loader: legacyLoader } = await import("../app/routes/saln.$");
    const legacyRequest = (path: string) => legacyLoader({ request: new Request(`http://localhost${path}`), params: { "*": "test/a.pdf" }, context: {} });
    await assert.rejects(legacyRequest("/saln/test/a.pdf?download=1"), error => error instanceof Response && error.status === 301 && error.headers.get("Location") === `/documents/${sha256}?download=1`);
    await assert.rejects(legacyRequest("/saln/unknown.pdf"), error => error instanceof Response && error.status === 404);
    const { loader: documentLoader } = await import("../app/routes/documents.$sha256");
    const response = await documentLoader({ request: new Request(`http://localhost/documents/${sha256}?download=1`), params: { sha256 }, context: {} });
    assert.match(response.headers.get("Content-Disposition")!, /^attachment;/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    await assert.rejects(applyReviewedManifest(state.db, manifest("wrong-pdf", { documents: [{ path: "/saln/other.pdf", sourceDocumentId: "document-a", sha256: "a".repeat(64) }] })), /exact checksum/);
    const exported = await exportPublicSnapshot(state.db);
    assert.deepEqual(exported.snapshot.data.people.map(row => row.id), ["c"]);
    assert.equal(exported.snapshot.data.filings[0].personId, "c");
    assert.equal(exported.snapshot.data.tenures[0].personId, "c");
    assert.equal(exported.snapshot.data.identityMatches.length, 2);
    assert.equal(exported.snapshot.data.legacyDocuments[0].sha256, sha256);
    assert.ok(exported.snapshot.data.personAliases.some(row => row.value === "a" && row.personId === "c"));
    assert.doesNotMatch(exported.snapshotJson, /Private synthetic reviewer|reviewedBy|manifestId|storageKey/);
    assert.equal((await applyReviewedManifest(state.db, first)).status, "unchanged");
    assert.equal((await applyReviewedManifest(state.db, second)).status, "unchanged");
    assert.deepEqual(await exportPublicSnapshot(state.db), exported);
    assert.deepEqual(await state.db.select().from(schema.people), originalPeople);
    assert.deepEqual(await state.db.select().from(schema.tenures), originalTenures);
    assert.deepEqual(await state.db.select().from(schema.filings), originalFilings);
    assert.deepEqual(await state.db.select().from(schema.sourceDocuments), originalDocuments);
    assert.deepEqual(Buffer.from((await state.storage.get(sha256))!), bytes);
    const html = renderToStaticMarkup(createElement(PersonProfile, { record }));
    assert.match(html, /Identity Matches/);
    assert.match(html, /Synthetic reviewed identity match/);
    assert.match(html, /href="https:\/\/example.org\/identity"/);
    // Losing the sole eligible Tenure also closes the former document URL and snapshot mappings.
    await state.db.update(schema.tenures).set({ verificationStatus: "unverified" }).where(eq(schema.tenures.personId, "a"));
    assert.equal(await state.archive.findLegacyDocument("/saln/test/a.pdf"), null);
    assert.ok(Object.values((await exportPublicSnapshot(state.db)).snapshot.data).every(rows => rows.length === 0));
  } finally {
    await closeArchive(); await state.close();
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test("loop, missing target, alias collisions and citation changes roll back the entire identity application", async () => {
  const state = await setup();
  try {
    for (const id of ["a", "b", "c"]) await importReviewedPerson(state.db, person(id));
    await applyReviewedManifest(state.db, manifest("a-to-b", { matches: [match("a", "b")] }));
    const before = await state.db.select().from(schema.manifestApplications);
    await assert.rejects(applyReviewedManifest(state.db, manifest("loop", { matches: [match("b", "a")] })), /loop/);
    await assert.rejects(applyReviewedManifest(state.db, manifest("second-target", { matches: [match("a", "c")] })), /merge target/);
    await assert.rejects(applyReviewedManifest(state.db, manifest("unknown", { matches: [match("b", "absent")] })), /existing People/);
    await assert.rejects(applyReviewedManifest(state.db, manifest("collision", { legacyPeople: [legacy("new", ["profile-c"])] })), /collision/);
    assert.equal(await state.archive.findPersonBySlug("new"), null);
    await assert.rejects(applyReviewedManifest(state.db, manifest("cross-kind", { legacyPeople: [legacy("new1", ["same-key"]), legacy("new2", [], ["same-key"])] })), /collision/);
    const changed = { ...match("b", "c"), citations: [{ ...citation, publisher: "Changed publisher" }] };
    await assert.rejects(applyReviewedManifest(state.db, manifest("changed-citation", { matches: [changed] })), /immutable metadata/);
    await applyReviewedManifest(state.db, manifest("reserve", { legacyPeople: [legacy("c", ["reserved-key"])] }));
    const newPerson = person("other"); newPerson.person.slug = "reserved-key";
    await assert.rejects(importReviewedPerson(state.db, newPerson), /collision/);
    const idCollision = person("profile-c");
    await assert.rejects(importReviewedPerson(state.db, idCollision), /collision/);
    assert.deepEqual((await state.db.select().from(schema.manifestApplications)).filter(row => row.id !== "reserve"), before);
  } finally { await state.close(); }
});

test("identity manifests reject unsupported matches and unsafe legacy PDF paths", () => {
  for (const path of ["/other/a.pdf", "/saln/../a.pdf", "/saln/%2e%2e/a.pdf", "/saln/%252e%252e/a.pdf", "/saln//a.pdf", "/saln/a.pdf?download=1", "/saln/a%00.pdf", "/saln/a\\b.pdf", "/saln/a.jpg", "/saln/%zz.pdf"]) assert.throws(() => legacyDocumentPath(path));
  assert.equal(legacyDocumentPath("/saln/test/a%20b.pdf"), "/saln/test/a%20b.pdf");
  assert.throws(() => validateReviewedManifest(manifest("self", { matches: [match("a", "a")] })), /itself/);
  assert.throws(() => validateReviewedManifest(manifest("unsupported", { matches: [{ ...match("a", "b"), citations: [{ ...citation, supports: ["person"] }] }] })), /identity evidence/);
  assert.throws(() => validateReviewedManifest(manifest("empty", {})), /empty/);
  assert.throws(() => validateReviewedManifest({ ...manifest("private", {}), payload: { review, legacyPeople: [{ ...legacy("a"), contact: "must not publish" }], matches: [], documents: [] } }), /not supported/);
});

test("dated legacy identity manifest retains every reviewed key while publishing only the two evidenced survivors", async () => {
  const state = await setup();
  const previous = { ARCHIVE_ADAPTER: process.env.ARCHIVE_ADAPTER, TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL };
  try {
    for (const file of ["0001-ferdinand-marcos-jr.json", "0002-risa-hontiveros.json"]) await importReviewedPerson(state.db, JSON.parse(await readFile(new URL(`../data/reviewed/${file}`, import.meta.url), "utf8")));
    const input = validateReviewedManifest(JSON.parse(await readFile(new URL("../data/reviewed/0003-legacy-identities.json", import.meta.url), "utf8")));
    assert.equal(input.kind, "identities"); if (input.kind !== "identities") throw new Error("Expected identities");
    assert.equal((await applyReviewedManifest(state.db, input)).status, "applied");
    assert.equal(input.payload.legacyPeople.length, 49);
    assert.equal(new Set(input.payload.legacyPeople.flatMap(row => row.slugs)).size, 56);
    for (const entry of input.payload.legacyPeople) for (const key of [entry.person.id, entry.person.slug, ...entry.slugs, ...entry.identifiers]) {
      const expected: string = input.payload.matches.find(row => row.fromPersonId === entry.person.id)?.toPersonId ?? entry.person.id;
      assert.equal((await state.archive.findPersonBySlug(key))?.person.id, expected);
    }
    assert.equal((await state.archive.listPeople()).length, 2);
    const unverified = (await state.archive.findPersonBySlug("aimee-ferolino-ampoloquio"))!;
    assert.equal(unverified.person.eligibility, "unverified");
    const html = renderToStaticMarkup(createElement(PersonProfile, { record: unverified }));
    assert.match(html, /Archive eligibility is not verified/);
    assert.match(html, /excluded from public directories, search, and coverage counts/);
    assert.deepEqual(unverified.filings, []);
    assert.deepEqual(unverified.financialSummaries, []);
    const exported = await exportPublicSnapshot(state.db);
    assert.equal(exported.snapshot.data.people.length, 2);
    assert.equal(exported.snapshot.data.identityMatches.length, 2);
    assert.doesNotMatch(exported.snapshotJson, /Aimee|Filing status|net_worth|saln_records/);
    assert.equal((await applyReviewedManifest(state.db, input)).status, "unchanged");
    Object.assign(process.env, { ARCHIVE_ADAPTER: "turso", TURSO_DATABASE_URL: state.url });
    const { loader } = await import("../app/routes/official.$slug");
    const load = (slug: string) => loader({ request: new Request(`http://localhost/official/${slug}?source=legacy`), params: { slug }, context: {} });
    await assert.rejects(load("ferdinand-bongbong-romualdez-marcos-jr"), error => error instanceof Response && error.status === 301 && error.headers.get("Location") === "/official/ferdinand-marcos-jr?source=legacy");
    await assert.rejects(load("sen-006"), error => error instanceof Response && error.status === 301 && error.headers.get("Location") === "/official/risa-hontiveros?source=legacy");
    assert.equal((await load("risa-hontiveros")).person.person.id, "person-risa-hontiveros"); // No self-redirect.
    assert.equal((await load("aimee-ferolino-ampoloquio")).person.person.eligibility, "unverified");
  } finally {
    await closeArchive(); await state.close();
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test("identity migration preserves a populated correction ledger and restores foreign-key enforcement", async () => {
  const state = await setup();
  const statements = async (file: string) => (await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8")).split(/--> statement-breakpoint|;/).map(sql => sql.trim()).filter(Boolean);
  try {
    await importReviewedPerson(state.db, person("a"));
    await applyReviewedManifest(state.db, { id: "correct-a", version: 1, kind: "correction", payload: { review, target: { type: "person", id: "a" }, previousCorrectionId: null,
      reason: "Synthetic name correction", changes: { canonicalName: "Corrected" }, citations: [{ ...citation, supports: ["canonicalName"] }] } });
    const ledger = await state.db.select().from(schema.manifestApplications), history = await state.db.select().from(schema.editorialCorrections);
    await state.client.migrate(await statements("0004_down.sql"));
    assert.deepEqual(await state.db.select().from(schema.manifestApplications), ledger);
    assert.deepEqual(await state.db.select().from(schema.editorialCorrections), history);
    await state.client.migrate(await statements("0004_reviewed_identities.sql"));
    assert.deepEqual(await state.db.select().from(schema.manifestApplications), ledger);
    assert.deepEqual(await state.db.select().from(schema.editorialCorrections), history);
    assert.deepEqual((await state.client.execute("PRAGMA foreign_key_check")).rows, []);
    assert.equal((await state.client.execute("PRAGMA foreign_keys")).rows[0].foreign_keys, 1);
    await assert.rejects(state.db.insert(schema.personAliases).values({ kind: "slug", value: "absent", personId: "absent", sourceUrl: "https://example.org", manifestId: "correct-a" }));
  } finally { await state.close(); }
});
