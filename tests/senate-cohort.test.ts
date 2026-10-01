import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from 'react-router';
import { exportPublicSnapshot } from "../app/archive/snapshot.server";
import { ArchiveHome } from "../app/components/ArchiveHome";
import { connectArchive } from "../app/db/client.server";
import { applyReviewedManifest } from "../app/db/manifests.server";
import { createDbArchive } from "../app/db/people.server";
import { migrateArchive } from "../scripts/migrate";

test("reviewed Senate cohorts and stage-one roster reconcile stable People and concurrent leadership without legacy totals", async () => {
  const directory = await mkdtemp(join(tmpdir(), "saln-senate-")), { client, db } = connectArchive({ url: `file:${join(directory, "archive.db")}` });
  const data = new URL("../data/reviewed/", import.meta.url);
  async function apply(path: string) {
    const input = JSON.parse(await readFile(new URL(path, data), "utf8"));
    return applyReviewedManifest(db, input.kind ? input : { id: `person:${input.person.id}`, version: 1, kind: 'person', payload: input });
  }
  try {
    await migrateArchive(db);
    const initial = ["0001-ferdinand-marcos-jr.json", "0002-risa-hontiveros.json", "0003-legacy-identities.json"];
    for (const name of initial) await apply(name);
    const paths = (await readdir(new URL("senate-2022-cohort/", data))).filter(name => name.endsWith('.json')).sort().map(name => `senate-2022-cohort/${name}`);
    for (const path of paths) assert.equal((await apply(path)).status, "applied");
    const archive = createDbArchive(db), home = await archive.readHome(), senate = home.rosters.find(roster => roster.snapshot.scope === 'senate')!;
    assert.equal(new Set(senate.rows.map(row => row.personId)).size, 12); assert.equal(senate.rows.length, 13);
    assert.equal(senate.snapshot.verifiedAsOf, '2026-09-21'); assert.ok(senate.rows.every(row => row.documentCount === 0 && row.latestSummary === null));
    assert.equal(home.recentlyAdded.length, 0);
    const gatchalian = (await archive.findPersonBySlug('win-gatchalian'))!;
    assert.equal(gatchalian.person.id, 'person-legacy-18eff8b6ce250cae'); assert.equal(gatchalian.tenures.length, 2);
    const leader = gatchalian.tenures.find(tenure => tenure.officeId === 'office-senate-president-ph')!;
    assert.deepEqual(leader.startDate, { value: '2026-06-17', precision: 'day' }); assert.equal(leader.assumptionMethod, 'chamber_selection');
    assert.equal(gatchalian.tenures.find(tenure => tenure.officeId === 'office-senator-ph')!.startDate, null);
    const risa = (await archive.findPersonBySlug('risa-hontiveros'))!;
    assert.equal(risa.tenures.length, 1); assert.equal(risa.person.id, 'person-risa-hontiveros'); assert.equal(risa.rosterMemberships?.length, 1);
    for (const row of senate.rows) assert.equal((await archive.findPersonBySlug(row.slug))?.person.eligibility, 'eligible');
    const before = await exportPublicSnapshot(db);
    assert.equal(before.snapshot.data.filings.length, 0); assert.equal(before.snapshot.data.sourceDocuments.length, 0); assert.equal(before.snapshot.data.financialSummaries.length, 0);
    for (const path of [...initial, ...paths]) assert.equal((await apply(path)).status, 'unchanged');
    assert.equal((await exportPublicSnapshot(db)).snapshotJson, before.snapshotJson);
    const html = renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(ArchiveHome, { data: home })));
    assert.match(html, /People shown from this Snapshot: 12/); assert.match(html, /Totals not transcribed/); assert.doesNotMatch(html, /₱/);
    for (const name of ['0004-sara-duterte.json', '0005-executive-roster-2026-09-28.json']) await apply(name);
    const completion = (await readdir(new URL('stage-one-completion/', data))).filter(name => name.endsWith('.json')).sort().map(name => `stage-one-completion/${name}`);
    for (const path of completion) assert.equal((await apply(path)).status, 'applied');
    const completeHome = await archive.readHome(), completeSenate = completeHome.rosters.find(roster => roster.snapshot.scope === 'senate')!;
    assert.equal(completeHome.rosters.length, 3); assert.equal(completeSenate.snapshot.id, 'roster-senate-2026-09-21');
    assert.equal(new Set(completeSenate.rows.map(row => row.personId)).size, 24); assert.equal(completeSenate.rows.length, 25);
    assert.equal(completeHome.rosters.find(roster => roster.snapshot.scope === 'speaker')!.rows[0].canonicalName, 'Faustino G. Dy III');
    const speaker = (await archive.findPersonBySlug('faustino-bojie-dy-iii'))!;
    assert.equal(speaker.person.eligibility, 'eligible'); assert.equal(speaker.tenures.length, 2);
    assert.equal(speaker.constituencies[0].name, 'Isabela 6th District');
    assert.deepEqual(speaker.tenures.find(tenure => tenure.officeId === 'office-house-speaker-ph')!.startDate, { value: '2025-09-17', precision: 'day' });
    assert.equal(speaker.tenures.find(tenure => tenure.officeId === 'office-house-representative-ph')!.startDate, null);
    for (const roster of completeHome.rosters) for (const row of roster.rows) assert.equal((await archive.findPersonBySlug(row.slug))?.person.eligibility, 'eligible');
    const complete = await exportPublicSnapshot(db);
    assert.equal(complete.snapshot.data.people.length, 27); assert.equal(complete.snapshot.data.tenures.length, 29); assert.equal(complete.snapshot.data.rosterSnapshots.length, 4);
    assert.equal(complete.snapshot.data.filings.length, 0); assert.equal(complete.snapshot.data.sourceDocuments.length, 0); assert.equal(complete.snapshot.data.financialSummaries.length, 0);
    for (const path of completion) assert.equal((await apply(path)).status, 'unchanged');
    assert.equal((await exportPublicSnapshot(db)).snapshotJson, complete.snapshotJson);
  } finally { client.close(); await rm(directory, { recursive: true, force: true }); }
});
