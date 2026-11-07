import assert from "node:assert/strict";
import test from "node:test";
import { createLegacyArchive } from "../app/archive/legacy";
import { createLocalArchive } from "../app/archive/local";
import type { PersonRecord } from "../app/archive/types";

test("legacy homepage and profile use one read and keep unreviewed data out of canonical evidence", async () => {
  const records = [2020, 2022, 2022].map((year, index) => ({
    year, net_worth: 100 + index, total_assets: 200, total_liabilities: 100 - index,
    assets: [], liabilities: [], date_filed: `${year}-12-31`, status: "verified",
    source_url: "https://example.org/news-report",
  }));
  const document = {
    id: "durable-id",
    data: { name: "Sample Person", position: "Senator", agency: "LEGISLATIVE", status: "active", saln_records: records },
  };
  let reads = 0;
  const archive = createLegacyArchive({
    async list() { reads++; return [document, { id: "invalid", data: { name: "Incomplete" } }]; },
    async find(slug) { reads++; return slug === document.id ? document : null; },
  });
  const home = await archive.readHome();
  assert.equal(reads, 1);
  assert.equal(home.people.length, 1);
  assert.equal(home.people[0].person.id, "durable-id");
  assert.equal(home.people[0].person.slug, "durable-id");
  assert.equal(home.legacyPresentation[0].saln_count, 3);
  assert.equal(home.legacyPresentation[0].latest_saln_year, 2022);
  assert.equal(home.legacyPresentation[0].latest_saln_record?.net_worth, 101);
  const profile = await archive.readProfile("durable-id");
  assert.equal(reads, 2);
  assert.deepEqual(profile?.legacyPresentation.salnRecords.map(record => record.year), [2022, 2022, 2020]);
  assert.deepEqual(document.data.saln_records, records);
  assert.equal(profile?.person.person.eligibility, "unverified");
  assert.deepEqual(profile?.person.tenures, []);
  assert.deepEqual(profile?.person.filings, []);
  assert.deepEqual(profile?.person.sourceDocuments, []);
  assert.deepEqual(profile?.person.financialSummaries, []);
  assert.deepEqual(await archive.listPeople(), []);
  assert.equal(await archive.findPersonBySlug("absent"), null);
});

test("local archive preserves identities and aliases and isolates each read", async () => {
  const record: PersonRecord = {
    person: { id: "person-1", slug: "sample-person", canonicalName: "Sample Person", nameVariants: ["Person, Sample"], legacySlugs: ["old-name"], eligibility: "eligible" },
    offices: [], tenures: [], constituencies: [], jurisdictions: [], electoralTerms: [],
    filings: [], sourceDocuments: [], financialSummaries: [],
  };
  const unverified = structuredClone(record);
  unverified.person = { ...unverified.person, id: "person-2", slug: "unverified", legacySlugs: [], eligibility: "unverified" };
  const archive = createLocalArchive([record, unverified]);
  record.person.canonicalName = "Changed input";
  const people = await archive.listPeople();
  assert.equal(people.length, 1);
  people[0].person.canonicalName = "Changed result";
  assert.equal((await archive.findPersonBySlug("old-name"))?.person.canonicalName, "Sample Person");
  assert.equal((await archive.findPersonBySlug("unverified"))?.person.eligibility, "unverified");
  assert.equal(await archive.findPersonBySlug("absent"), null);
});

test("legacy summaries remain visible when itemization is absent", async () => {
  const archive = createLegacyArchive({
    async list() { return []; },
    async find() { return { id: "summary-only", data: {
      name: "Summary Person", agency: "LEGISLATIVE", status: "active",
      saln_records: [{ year: 2020, net_worth: 10, total_assets: 12, total_liabilities: 2 }],
    } }; },
  });
  const profile = await archive.readProfile("summary-only");
  assert.equal(profile?.legacyPresentation.officialWithSALN.saln_count, 1);
  assert.equal(profile?.legacyPresentation.officialWithSALN.latest_saln_record?.net_worth, 10);
  assert.deepEqual(profile?.legacyPresentation.salnRecords[0].assets, []);
  assert.deepEqual(profile?.legacyPresentation.salnRecords[0].liabilities, []);
  assert.deepEqual(profile?.person.financialSummaries, []);
});

test("route loaders run locally without Firebase and preserve the missing-profile response", async () => {
  const previous = process.env.ARCHIVE_ADAPTER;
  process.env.ARCHIVE_ADAPTER = "local";
  try {
    const { loader: homeLoader } = await import("../app/routes/home");
    const { loader: profileLoader } = await import("../app/routes/official.$slug");
    assert.deepEqual(await homeLoader({ request: new Request("http://localhost/"), params: {}, context: {} }), {
      people: [], officials: [],
    });
    await assert.rejects(
      profileLoader({ request: new Request("http://localhost/official/absent"), params: { slug: "absent" }, context: {} }),
      (error: unknown) => error instanceof Response && error.status === 404,
    );
  } finally {
    if (previous === undefined) delete process.env.ARCHIVE_ADAPTER;
    else process.env.ARCHIVE_ADAPTER = previous;
  }
});
