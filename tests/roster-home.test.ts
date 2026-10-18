import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { eq } from "drizzle-orm";
import { ArchiveHome } from "../app/components/ArchiveHome";
import { exportPublicSnapshot } from "../app/archive/snapshot.server";
import { closeArchive } from "../app/archive/archive.server";
import { connectArchive } from "../app/db/client.server";
import { applyReviewedManifest, validateReviewedManifest } from "../app/db/manifests.server";
import { createDbArchive } from "../app/db/people.server";
import { rosterMembers, manifestApplications, tenures } from "../app/db/schema";
import { validateReviewedRoster } from "../app/db/rosters.server";
import type { DocumentStorage } from "../app/storage/objects.server";
import { migrateArchive, rollbackArchive } from "../scripts/migrate";

async function json(name: string) { return JSON.parse(await readFile(new URL(`../data/reviewed/${name}`, import.meta.url), "utf8")); }
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "saln-roster-"));
  const url = `file:${join(directory, "archive.db")}`;
  const connection = connectArchive({ url });
  await migrateArchive(connection.db);
  for (const name of ["0001-ferdinand-marcos-jr.json", "0002-risa-hontiveros.json"]) {
    const payload = await json(name);
    await applyReviewedManifest(connection.db, { id: `person:${payload.person.id}`, version: 1, kind: "person", payload });
  }
  for (const name of ["0003-legacy-identities.json", "0004-sara-duterte.json", "0005-executive-roster-2026-09-28.json"]) await applyReviewedManifest(connection.db, await json(name));
  return { ...connection, url, async close() { connection.client.close(); await rm(directory, { recursive: true, force: true }); } };
}

test("reviewed executive roster uses actual cited Tenures, stable identities and truthful zero-document states", async () => {
  const state = await setup();
  const previous = { ARCHIVE_ADAPTER: process.env.ARCHIVE_ADAPTER, TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL };
  try {
    const archive = createDbArchive(state.db);
    const home = await archive.readHome();
    assert.equal(home.rosters[0].snapshot.verifiedAsOf, "2026-09-28");
    assert.deepEqual(home.rosters[0].rows.map(row => row.officeName), ["President of the Philippines", "Vice President of the Philippines"]);
    assert.ok(home.rosters[0].rows.every(row => row.documentCount === 0 && row.latestSummary === null));
    const vp = await archive.findPersonBySlug("vp-001");
    assert.equal(vp?.person.id, "person-legacy-86726305bdc8e680");
    assert.deepEqual(vp?.tenures[0].startDate, { value: "2022-06-30", precision: "day" });
    assert.equal(vp?.tenures[0].endDate, null);
    assert.equal(vp?.tenures[0].citations.find(source => source.id === "evidence-sara-inauguration-2022")?.publishedDate?.value, "2022-06-19");
    process.env.ARCHIVE_ADAPTER = "turso"; process.env.TURSO_DATABASE_URL = state.url;
    const { loader } = await import("../app/routes/home");
    const loaded = await loader({ request: new Request("http://localhost/"), params: {}, context: {} });
    assert.deepEqual(loaded.archive, home); assert.equal('officials' in loaded, false);
    const markup = renderToStaticMarkup(React.createElement(MemoryRouter, {}, React.createElement(ArchiveHome, { data: home })));
    assert.match(markup, /Roster Snapshot · Verified as of/); assert.match(markup, /Totals not transcribed/);
    assert.match(markup, /No SALN currently in the archive/); assert.match(markup, /scope="row"/); assert.match(markup, /tabindex="0"/);
    assert.ok(markup.indexOf("President of the Philippines") < markup.indexOf("Vice President of the Philippines"));
    const exported = await exportPublicSnapshot(state.db);
    assert.equal(exported.snapshot.data.rosterSnapshots.length, 1);
    assert.ok(!exported.snapshotJson.includes("reviewedBy"));
    assert.equal((await applyReviewedManifest(state.db, await json("0005-executive-roster-2026-09-28.json"))).status, "unchanged");
  } finally { await closeArchive(); await state.close(); for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});

test('a later review replaces an equal-date Snapshot even when its ID sorts last', async () => {
  const state = await setup();
  try {
    const replacement = await json('0005-executive-roster-2026-09-28.json');
    replacement.id = 'z-replacement'; replacement.payload.review.reviewedAt = '2026-10-03';
    replacement.payload.members = [replacement.payload.members[1]];
    await applyReviewedManifest(state.db, replacement);
    const home = await createDbArchive(state.db).readHome();
    assert.equal(home.rosters[0].snapshot.id, 'z-replacement');
    assert.deepEqual(home.rosters[0].rows.map(row => row.officeName), ['Vice President of the Philippines']);
  } finally { await state.close(); }
});

test('review timestamps order same-day replacements independently of IDs and import order', async () => {
  const state = await setup();
  try {
    const later = await json('0005-executive-roster-2026-09-28.json');
    await assert.rejects(applyReviewedManifest(state.db, { ...later, id: 'ambiguous-day' }), /distinct reviewed timestamp/);
    later.id = 'z-same-day'; later.payload.review.reviewedAt = '2026-10-02T14:00:00.000Z';
    later.payload.members = [later.payload.members[1]];
    const earlier = await json('0005-executive-roster-2026-09-28.json');
    earlier.id = 'a-same-day'; earlier.payload.review.reviewedAt = '2026-10-02T10:00:00.000Z';
    for (const manifest of [later, earlier]) await applyReviewedManifest(state.db, manifest);
    const home = await createDbArchive(state.db).readHome();
    assert.equal(home.rosters[0].snapshot.id, later.id);
    assert.deepEqual(home.rosters[0].rows.map(row => row.officeName), ['Vice President of the Philippines']);
    await assert.rejects(applyReviewedManifest(state.db, { ...later, id: 'ambiguous-time' }), /distinct reviewed timestamp/);
    for (const reviewedAt of ['2026-02-30T14:00:00.000Z', '2026-10-02T14:00:00+00:00', '2026-09-27T14:00:00.000Z']) assert.throws(() => validateReviewedRoster({ ...later.payload, review: { ...later.payload.review, reviewedAt } }));
    assert.equal((await applyReviewedManifest(state.db, later)).status, 'unchanged');
  } finally { await state.close(); }
});

test('Roster reads and exports exclude Tenures whose corrected dates or verification no longer support membership', async () => {
  for (const changes of [{ startDate: { value: '2027', precision: 'year' } }, { endDate: { value: '2025', precision: 'year' } }, { verificationStatus: 'unverified' }, { verificationStatus: 'disputed', disputedFacts: ['office'] }]) {
    const state = await setup();
    try {
      const person = await json('0001-ferdinand-marcos-jr.json');
      person.tenures.push({ ...person.tenures[0], id: 'another-eligible-tenure' });
      await applyReviewedManifest(state.db, { id: 'person:another-eligible-tenure', version: 1, kind: 'person', payload: person });
      await applyReviewedManifest(state.db, { id: 'corrected-boundary', version: 1, kind: 'correction', payload: {
        review: { reviewedAt: '2026-10-02', reviewedBy: 'Synthetic reviewer' }, target: { type: 'tenure', id: 'tenure-marcos-president-2022' },
        reason: 'Synthetic boundary correction', previousCorrectionId: null, changes,
        citations: [{ id: 'boundary-evidence', title: 'Synthetic evidence', url: 'https://example.org/boundary', publisher: 'Test', type: 'official_record', supports: [...Object.keys(changes), 'person', 'office'], publishedDate: null }],
      } });
      const home = await createDbArchive(state.db).readHome();
      assert.deepEqual(home.rosters[0].rows.map(row => row.officeName), ['Vice President of the Philippines']);
      assert.equal(home.rosters[0].omittedMemberCount, 1);
      const html = renderToStaticMarkup(React.createElement(MemoryRouter, {}, React.createElement(ArchiveHome, { data: home })));
      assert.match(html, /Some roster entries are not shown/);
      const exported = await exportPublicSnapshot(state.db);
      assert.ok(exported.snapshot.data.tenures.some(row => row.id === 'tenure-marcos-president-2022'));
      assert.deepEqual(exported.snapshot.data.rosterSnapshots[0].members.map(row => row.tenureId), home.rosters[0].snapshot.members.map(row => row.tenureId));
      assert.equal(exported.snapshot.data.rosterSnapshots[0].members.length, 1);
      assert.equal((await state.db.select().from(rosterMembers)).length, 2);
    } finally { await state.close(); }
  }
});

test("Recently Added uses corrected publication dates, groups exact copies and excludes unresolved Persons", async () => {
  const state = await setup();
  const objects = new Map<string, Uint8Array>();
  const storage: DocumentStorage = { async get(hash) { return objects.get(hash) ?? null; }, async put(bytes, hash) { objects.set(hash, bytes); return { created: true, storageKey: `documents/sha256/${hash}` }; } };
  try {
    for (const [id, year, publication, body] of [["new-period", "2025", "2026-09-27", "first"], ["old-period", "2001", "2026-09-28", "second"], ["old-period-copy", "2001", "2026-09-28", "second"]]) {
      const bytes = Buffer.from(`%PDF-1.7\nSynthetic ${body}\n%%EOF\n`), sha256 = createHash("sha256").update(bytes).digest("hex");
      const filingId = id === "old-period-copy" ? "old-period" : id;
      await applyReviewedManifest(state.db, { id: `source:${id}`, version: 1, kind: "filing", payload: {
        review: { reviewedAt: "2026-09-26", reviewedBy: "Synthetic reviewer" },
        filing: { id: filingId, personId: "person-ferdinand-marcos-jr", filerName: "SYNTHETIC", reportingDate: { value: year, precision: "year" }, executionDate: null, receiptDate: null, supersedesFilingId: null },
        document: { id, filingId, fileName: `${id}.pdf`, mediaType: "application/pdf", byteSize: bytes.byteLength, sha256, originalUrl: "https://example.org/synthetic.pdf", provenanceType: "official_download", provenanceNote: "Synthetic test only", officialReleaseDate: null, acquisitionDate: { value: "2026-09-26", precision: "day" }, archivePublicationDate: `${publication}T10:00:00.000Z`, transcriptionLevel: "document_only" },
      } }, { bytes, storage });
    }
    const archive = createDbArchive(state.db);
    assert.deepEqual((await archive.readHome()).recentlyAdded.map(row => row.id), ["old-period", "new-period"]);
    assert.equal((await archive.readHome()).rosters[0].rows[0].documentCount, 2);
    await applyReviewedManifest(state.db, { id: "publication-correction", version: 1, kind: "correction", payload: {
      review: { reviewedAt: "2026-10-02", reviewedBy: "Synthetic reviewer" }, target: { type: "source_document", id: "new-period" }, reason: "Synthetic date correction", previousCorrectionId: null,
      changes: { archivePublicationDate: "2026-10-01T10:00:00.000Z" }, citations: [{ id: "date-proof", title: "Synthetic publication log", url: "https://example.org/log", publisher: "Test", type: "official_record", supports: ["archivePublicationDate"], publishedDate: null }],
    } });
    assert.deepEqual((await archive.readHome()).recentlyAdded.map(row => row.id), ["new-period", "old-period"]);
    const record = (await archive.findPersonBySlug("ferdinand-marcos-jr"))!;
    assert.equal(record.person.eligibility, "eligible");
    // Synthetic out-of-band change proves that both home paths use the shared eligibility guard.
    await state.db.update(tenures).set({ verificationStatus: "unverified" }).where(eq(tenures.id, "tenure-marcos-president-2022"));
    const unresolved = await archive.readHome();
    assert.equal(unresolved.recentlyAdded.length, 0); assert.equal(unresolved.rosters[0].rows.length, 1);
  } finally { await state.close(); }
});

test("Roster trust boundary rejects unsupported dates, private fields and ineligible or conflicting membership atomically", async () => {
  const state = await setup();
  try {
    const manifest = await json("0005-executive-roster-2026-09-28.json"), payload = manifest.payload;
    payload.review.reviewedAt = '2026-10-02T10:30:00.000Z';
    for (const scope of ['senate', 'speaker', 'house', 'local']) {
      await assert.rejects(applyReviewedManifest(state.db, { ...manifest, id: `wrong-scope-${scope}`, payload: { ...payload, scope } }), /declared scope/);
      assert.equal((await state.db.select().from(manifestApplications).where(eq(manifestApplications.id, `wrong-scope-${scope}`))).length, 0);
    }
    for (const invalid of [{ ...payload, privateContact: "private" }, { ...payload, verifiedAsOf: "2026" }, { ...payload, verifiedAsOf: "2027-01-01" }, { ...payload, members: [] }, { ...payload, members: [payload.members[0], payload.members[0]] }, { ...payload, members: [{ ...payload.members[0], citations: [] }] }]) assert.throws(() => validateReviewedRoster(invalid));
    await assert.rejects(applyReviewedManifest(state.db, { ...manifest, id: "missing-tenure", payload: { ...payload, members: [{ ...payload.members[0], tenureId: "absent" }] } }), /reviewed Tenure/);
    assert.equal((await state.db.select().from(manifestApplications).where(eq(manifestApplications.id, "missing-tenure"))).length, 0);
    await assert.rejects(applyReviewedManifest(state.db, { ...manifest, id: "changed-citation", payload: { ...payload, members: [{ ...payload.members[0], citations: [{ ...payload.members[0].citations[0], title: "Conflicting source title" }] }] } }), /different immutable metadata/);
    assert.equal((await state.db.select().from(rosterMembers)).length, 2);
    assert.throws(() => validateReviewedManifest({ ...manifest, payload: { ...payload, scope: "automatic_live_roster" } }));
    await rollbackArchive(state.client); await migrateArchive(state.db);
    assert.equal((await state.db.select().from(rosterMembers)).length, 0);
    assert.equal(Number((await state.client.execute("pragma foreign_keys")).rows[0].foreign_keys), 1);
  } finally { await state.close(); }
});
