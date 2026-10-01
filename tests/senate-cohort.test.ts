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

test("reviewed Senate batch A reconciles 12 stable People and 13 Tenures without legacy totals or SALN evidence", async () => {
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
    assert.match(html, /This Snapshot lists 12 People/); assert.match(html, /Totals not transcribed/); assert.doesNotMatch(html, /₱/);
  } finally { client.close(); await rm(directory, { recursive: true, force: true }); }
});
