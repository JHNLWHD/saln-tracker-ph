import assert from "node:assert/strict";
import test from "node:test";
import { createLocalArchive } from "../app/archive/local";
import type { PersonRecord } from "../app/archive/types";

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

test("route loaders run locally without Firebase and preserve the missing-profile response", async () => {
  const previous = process.env.ARCHIVE_ADAPTER;
  process.env.ARCHIVE_ADAPTER = "local";
  try {
    const { loader: homeLoader } = await import("../app/routes/home");
    const { loader: profileLoader } = await import("../app/routes/official.$slug");
    assert.deepEqual(await homeLoader({ request: new Request("http://localhost/"), params: {}, context: {} }), {
      archive: { rosters: [], recentlyAdded: [] },
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

 test("retired adapter cannot fall back to Firebase, including when the database URL is absent", async () => {
  const before = { ARCHIVE_ADAPTER: process.env.ARCHIVE_ADAPTER, TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL, ARCHIVE_ENVIRONMENT: process.env.ARCHIVE_ENVIRONMENT };
  try {
    delete process.env.ARCHIVE_ENVIRONMENT;
    const { getArchive } = await import('../app/archive/archive.server');
    process.env.ARCHIVE_ADAPTER = 'firebase'; await assert.rejects(getArchive(), /Unknown Archive adapter/);
    delete process.env.ARCHIVE_ADAPTER; delete process.env.TURSO_DATABASE_URL;
    await assert.rejects(getArchive(), /TURSO_DATABASE_URL is required/);
  } finally { for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});
