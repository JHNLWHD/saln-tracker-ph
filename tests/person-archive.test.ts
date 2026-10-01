import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { connectArchive } from "../app/db/client.server";
import { writeDatabaseConfig } from "../app/db/cli";
import { createDbArchive, importReviewedPerson } from "../app/db/people.server";
import { people, personNames, tenureCitations } from "../app/db/schema";
import { hasEligibleTenure, parsePartialDate, validateReviewedPerson, type ReviewedPerson } from "../app/db/validation";
import { migrateArchive, rollbackArchive } from "../scripts/migrate";

function reviewedPerson(id = "person-1"): ReviewedPerson {
  return {
    review: { reviewedAt: "2026-09-26", reviewedBy: "Synthetic test reviewer" },
    person: { id, slug: id, canonicalName: "Sample Person", nameVariants: ["Person, Sample"] },
    jurisdictions: [{ id: "country", name: "Test Country", kind: "country" }, { id: "city", name: "Test City", kind: "city" }],
    jurisdictionRelationships: [{ fromId: "city", toId: "country", kind: "geographic" }],
    offices: [{ id: "office", name: "Test elected office", kind: "elected", included: true, jurisdictionId: "country" }],
    constituencies: [{ id: "constituency", name: "Test electorate", kind: "nation", jurisdictionId: "country" }],
    electoralTerms: [{ id: "term", officeId: "office", startDate: { value: "2020", precision: "year" }, endDate: { value: "2026", precision: "year" } }],
    tenures: [{
      id: `tenure-${id}`, personId: id, officeId: "office", electoralTermId: "term", constituencyId: "constituency",
      startDate: { value: "2020", precision: "year" }, endDate: null, assumptionMethod: "unknown", verificationStatus: "verified", disputedFacts: [],
      citations: [{ id: `citation-${id}`, title: "Test public report", publisher: "Test Publisher", url: "https://example.org/report", type: "public_article", supports: ["person", "office", "startDate"], publishedDate: { value: "2020-07", precision: "month" } }],
    }],
  };
}

async function openDatabase() {
  const directory = await mkdtemp(join(tmpdir(), "saln-archive-test-"));
  const url = `file:${join(directory, "archive.db")}`;
  const connection = connectArchive({ url });
  await migrateArchive(connection.db);
  return { ...connection, url, async close() { connection.client.close(); await rm(directory, { recursive: true, force: true }); } };
}

test("reviewed Person is imported transactionally and read without inventing a Tenure end", async () => {
  const { client, db, close } = await openDatabase();
  try {
    const input = reviewedPerson();
    assert.deepEqual(await importReviewedPerson(db, input), { personId: "person-1", eligible: true });
    const archive = createDbArchive(db);
    const record = await archive.findPersonBySlug("person-1");
    assert.equal(record?.person.canonicalName, "Sample Person");
    assert.deepEqual(record?.person.nameVariants, ["Person, Sample"]);
    assert.equal(record?.person.eligibility, "eligible");
    assert.deepEqual(record?.tenures[0].startDate, { value: "2020", precision: "year" });
    assert.equal(record?.tenures[0].endDate, null);
    assert.deepEqual(record?.electoralTerms[0].endDate, { value: "2026", precision: "year" });
    assert.deepEqual(record?.tenures[0].citations[0].publishedDate, { value: "2020-07", precision: "month" });
    assert.deepEqual(record?.filings, []);
    assert.deepEqual(record?.sourceDocuments, []);
    assert.deepEqual(record?.financialSummaries, []);
    assert.equal((await archive.listPeople()).length, 1);
    assert.equal(await archive.findPersonBySlug("absent"), null);
    const conflict = reviewedPerson("rollback-person");
    conflict.offices[0].name = "Different Office with the same ID";
    await assert.rejects(importReviewedPerson(db, conflict), /different metadata/);
    assert.deepEqual(await db.select().from(people).where(eq(people.id, "rollback-person")), []);
    assert.deepEqual(await db.select().from(personNames).where(eq(personNames.personId, "rollback-person")), []);
    await assert.rejects(db.insert(tenureCitations).values({ tenureId: "missing", citationId: "missing", supports: [] }));
  } finally { await close(); }
});

test("date disputes retain citations and eligibility; sole identity or Office disputes do not", async () => {
  const { client, db, close } = await openDatabase();
  try {
    for (const fact of ["startDate", "person", "office"]) {
      const input = reviewedPerson(`disputed-${fact.toLowerCase()}`);
      input.tenures[0].verificationStatus = "disputed";
      input.tenures[0].disputedFacts = [fact];
      input.tenures[0].citations.push({ ...input.tenures[0].citations[0], id: `conflicting-${fact}`, title: "Conflicting test source", url: "https://example.org/conflicting" });
      assert.equal(hasEligibleTenure(validateReviewedPerson(input)), fact === "startDate");
      await importReviewedPerson(db, input);
    }
    const archive = createDbArchive(db);
    assert.deepEqual((await archive.listPeople()).map(record => record.person.id), ["disputed-startdate"]);
    const disputed = await archive.findPersonBySlug("disputed-office");
    assert.equal(disputed?.person.eligibility, "disputed");
    assert.equal(disputed?.tenures[0].citations.length, 2);
    const excluded = reviewedPerson("excluded");
    excluded.offices[0].id = "excluded-office";
    excluded.offices[0].included = false;
    excluded.tenures[0].officeId = "excluded-office";
    excluded.tenures[0].electoralTermId = null;
    excluded.electoralTerms = [];
    await importReviewedPerson(db, excluded);
    assert.equal((await archive.listPeople()).length, 1);
  } finally { await close(); }
});

test("unknown JSON fails validation for malformed fields, dates, references, and unsupported evidence", () => {
  const valid = reviewedPerson();
  const tenure = valid.tenures[0], citation = tenure.citations[0];
  const invalid: unknown[] = [
    null, [], { ...valid, privateContact: "must not enter public metadata" },
    { ...valid, review: { ...valid.review, reviewedAt: "2026" } },
    { ...valid, person: { ...valid.person, id: 9 } },
    { ...valid, person: { ...valid.person, slug: "unsafe/slug" } },
    { ...valid, person: { ...valid.person, nameVariants: [9] } },
    { ...valid, jurisdictions: [{ ...valid.jurisdictions[0], kind: "invented" }] },
    { ...valid, jurisdictionRelationships: [{ fromId: "unknown", toId: "country", kind: "geographic" }] },
    { ...valid, offices: [{ ...valid.offices[0], included: "true" }] },
    { ...valid, constituencies: [{ ...valid.constituencies[0], jurisdictionId: "unknown" }] },
    { ...valid, tenures: [{ ...tenure, personId: "wrong-person" }] },
    { ...valid, tenures: [{ ...tenure, officeId: "unknown" }] },
    { ...valid, tenures: [{ ...tenure, verificationStatus: "approved" }] },
    { ...valid, tenures: [{ ...tenure, assumptionMethod: "won_election" }] },
    { ...valid, tenures: [{ ...tenure, startDate: { value: "2020", precision: "day" } }] },
    { ...valid, tenures: [{ ...tenure, startDate: { value: "2021-02-29", precision: "day" } }] },
    { ...valid, tenures: [{ ...tenure, endDate: { value: "2019", precision: "year" } }] },
    { ...valid, tenures: [{ ...tenure, citations: [] }] },
    { ...valid, tenures: [{ ...tenure, disputedFacts: ["office"] }] },
    { ...valid, tenures: [{ ...tenure, verificationStatus: "disputed", disputedFacts: [] }] },
    { ...valid, tenures: [{ ...tenure, citations: [{ ...citation, supports: ["person"] }] }] },
    { ...valid, tenures: [{ ...tenure, citations: [{ ...citation, type: "anonymous_post" }] }] },
    { ...valid, tenures: [{ ...tenure, citations: [{ ...citation, url: "javascript:alert(1)" }] }] },
    { ...valid, tenures: [{ ...tenure, citations: [{ ...citation, publishedDate: { value: "2020-13", precision: "month" } }] }] },
  ];
  for (const input of invalid) assert.throws(() => validateReviewedPerson(input));
  assert.deepEqual(parsePartialDate("2020-02-29"), { value: "2020-02-29", precision: "day" });
  assert.equal(parsePartialDate(null), null);
  for (const value of ["2020-1", "2020-02-30", "2020-00", "0000", "2020-01-01T00:00:00Z"]) assert.throws(() => parsePartialDate(value));
});

test("initial migration reverses and can be reapplied to an empty local database", async () => {
  const { client, db, close } = await openDatabase();
  try {
    await rollbackArchive(client);
    const remaining = await client.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%'");
    assert.deepEqual(remaining.rows, []);
    await migrateArchive(db);
    assert.deepEqual(await db.select().from(people), []);
  } finally { await close(); }
});

test("remote CLI writes require an explicit staging target and cannot publish production", () => {
  assert.deepEqual(writeDatabaseConfig([], {}), { url: "file:.data/archive.db" });
  const remote = { TURSO_DATABASE_URL: "libsql://example.turso.io", TURSO_AUTH_TOKEN: "test-token", ARCHIVE_ENVIRONMENT: "staging" };
  assert.throws(() => writeDatabaseConfig([], remote), /Remote writes require/);
  assert.throws(() => writeDatabaseConfig(["--environment", "production"], remote), /release approval/);
  assert.throws(() => writeDatabaseConfig(["--environment", "staging"], { ...remote, ARCHIVE_ENVIRONMENT: "production" }), /Remote writes require/);
  assert.equal(writeDatabaseConfig(["--environment", "staging"], remote).url, remote.TURSO_DATABASE_URL);
});

test("existing profile route reads reviewed metadata from a local SQL database", async () => {
  const { db, url, close } = await openDatabase();
  const previous = { ARCHIVE_ADAPTER: process.env.ARCHIVE_ADAPTER, TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL, TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN };
  const { closeArchive } = await import("../app/archive/archive.server");
  try {
    await importReviewedPerson(db, reviewedPerson());
    process.env.ARCHIVE_ADAPTER = "turso";
    process.env.TURSO_DATABASE_URL = url;
    delete process.env.TURSO_AUTH_TOKEN;
    const { loader } = await import("../app/routes/official.$slug");
    const result = await loader({ request: new Request("http://localhost/official/person-1"), params: { slug: "person-1" }, context: {} });
    assert.equal(result.person.person.canonicalName, "Sample Person");
    assert.equal('legacyPresentation' in result, false);
    assert.deepEqual(result.person.sourceDocuments, []);
    await assert.rejects(loader({ request: new Request("http://localhost/official/absent"), params: { slug: "absent" }, context: {} }), (error: unknown) => error instanceof Response && error.status === 404);
  } finally {
    await closeArchive();
    await close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
