import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createClient } from "@libsql/client";
import { Timestamp } from "firebase/firestore";
import { canonicalJson } from "../app/db/canonical";
import { sha256, typedFirestoreValue } from "../scripts/legacy-capture";
import { prepareLegacyCopy } from "../scripts/legacy-copy";

async function writeCapture(directory: string, documents: unknown[], finishedAt = "2026-10-02T15:01:00.000Z") {
  const rawFiles = [];
  for (const index of [1, 2]) for (const kind of ["typed", "sdk"]) {
    const file = `officials-read-${index}.${kind}.json`;
    const body = JSON.stringify(kind === "typed" ? { documents } : { synthetic: true });
    await writeFile(join(directory, file), body);
    rawFiles.push({ file, sha256: sha256(body), byteSize: Buffer.byteLength(body) });
  }
  const capture = { format: "legacy-capture/v1", projectId: "saln-tracker-ph", database: "(default)", scope: "public_reader", writesPerformed: false,
    completeDatabaseDocumentTree: false, startedAt: "2026-10-02T15:00:00.000Z", finishedAt, readTime: null,
    documentCount: documents.length, dataSha256: sha256(canonicalJson(documents)), rawFiles };
  await writeFile(join(directory, "capture.json"), JSON.stringify(capture));
  return capture;
}

test("legacy SQL copy preserves every typed field, exposes nested records, replays unchanged, and rejects damaged captures", async () => {
  const directory = await mkdtemp(join(tmpdir(), "saln-legacy-copy-"));
  const client = createClient({ url: `file:${join(directory, "copy.db")}` });
  try {
    const documents = [{ id: "person-1", path: "officials/person-1", data: typedFirestoreValue({
      name: "Test O'Name", slug: "old-slug", unknownFutureField: { when: new Timestamp(123, 456789), text: "'); DROP TABLE legacy_firestore_captures; --", missing: null },
      saln_records: [{ year: 2024, total_assets: 123456.78, total_liabilities: 0, net_worth: 123456.78, status: "submitted", date_filed: "2024-12-31",
        source_url: "https://example.invalid/test", assets: [{ amount: 123456.78, note: "Original spelling" }], liabilities: [] }],
    }) }];
    const capture = await writeCapture(directory, documents);
    const copy = await prepareLegacyCopy(directory);
    await client.batch(copy.statements, "write");
    const saved = (await client.execute("SELECT * FROM legacy_firestore_captures")).rows;
    assert.equal(saved.length, 1);
    assert.deepEqual(JSON.parse(String(saved[0].documents_json)), documents);
    assert.equal(sha256(String(saved[0].documents_json)), copy.dataSha256);
    assert.deepEqual(JSON.parse(String(saved[0].capture_json)), capture);
    const [official] = (await client.execute("SELECT * FROM legacy_officials")).rows;
    assert.equal(official.id, "person-1");
    assert.equal(official.name, "Test O'Name");
    assert.equal(official.review_status, "unreviewed_legacy");
    const [saln] = (await client.execute("SELECT * FROM legacy_saln_records")).rows;
    assert.equal(saln.total_assets, 123456.78);
    assert.equal(saln.total_liabilities, 0);
    assert.equal(saln.legacy_status, "submitted");
    assert.equal(saln.legacy_date_filed, "2024-12-31");
    assert.ok(String(saln.assets_json).includes("Original spelling"));
    assert.equal(copy.salnCount, 1);
    assert.equal((await client.execute(copy.verificationSql)).rows[0].saln_records, 1);
    assert.equal((await client.execute(copy.verificationSql)).rows[0].source_data_matches, 1);
    await client.batch(copy.statements, "write");
    assert.deepEqual((await client.execute("SELECT * FROM legacy_firestore_captures")).rows, saved);
    // A fresh capture of unchanged data preserves the first capture's metadata.
    await writeFile(join(directory, "capture.json"), JSON.stringify({ ...capture, startedAt: "2026-10-18T15:00:00.000Z", finishedAt: "2026-10-18T15:01:00.000Z" }));
    const fresh = await prepareLegacyCopy(directory);
    await client.batch(fresh.statements, "write");
    assert.deepEqual((await client.execute("SELECT * FROM legacy_firestore_captures")).rows, saved);
    const verification = (await client.execute(fresh.verificationSql)).rows[0];
    assert.equal(verification.source_data_matches, 1);
    assert.equal(verification.capture_identity_matches, 1);
    assert.equal(verification.capture_metadata_matches, 0);
    assert.equal(verification.source_is_active, 1);
    assert.deepEqual((await client.execute("SELECT name FROM sqlite_master WHERE type = 'table'")).rows.map(row => row.name), ["legacy_firestore_captures"]);
    const path = join(directory, "officials-read-1.typed.json");
    await writeFile(path, await readFile(path, "utf8") + " ");
    await assert.rejects(prepareLegacyCopy(directory), /integrity/);
  } finally { client.close(); await rm(directory, { recursive: true, force: true }); }
});

test("legacy copy verification rejects a restored source that the runtime does not select", async () => {
  const directory = await mkdtemp(join(tmpdir(), "saln-legacy-copy-reverted-"));
  const client = createClient({ url: `file:${join(directory, "copy.db")}` });
  try {
    const original = [{ id: "person", path: "officials/person", data: typedFirestoreValue({ name: "Original", saln_records: [] }) }];
    const changed = [{ id: "person", path: "officials/person", data: typedFirestoreValue({ name: "Changed", saln_records: [] }) }];
    await writeCapture(directory, original);
    const first = await prepareLegacyCopy(directory);
    await client.batch(first.statements, "write");
    assert.equal((await client.execute(first.verificationSql)).rows[0].source_is_active, 1);

    await writeCapture(directory, changed, "2026-10-03T15:01:00.000Z");
    const second = await prepareLegacyCopy(directory);
    await client.batch(second.statements, "write");
    assert.equal((await client.execute(second.verificationSql)).rows[0].source_is_active, 1);
    const saved = (await client.execute("SELECT * FROM legacy_firestore_captures ORDER BY captured_at")).rows;

    await writeCapture(directory, original, "2026-10-04T15:01:00.000Z");
    const restored = await prepareLegacyCopy(directory);
    await client.batch(restored.statements, "write");
    const [verification] = (await client.execute(restored.verificationSql)).rows;
    assert.equal(verification.source_data_matches, 1);
    assert.equal(verification.capture_identity_matches, 1);
    assert.equal(verification.capture_metadata_matches, 0);
    assert.equal(verification.source_is_active, 0);
    assert.deepEqual((await client.execute("SELECT * FROM legacy_firestore_captures ORDER BY captured_at")).rows, saved);
    // The dependent runtime selects the newest immutable capture, with a digest tie-break.
    const [selected] = (await client.execute("SELECT data_sha256 FROM legacy_firestore_captures ORDER BY captured_at DESC, data_sha256 DESC LIMIT 1")).rows;
    assert.equal(selected.data_sha256, second.dataSha256);
    assert.notEqual(selected.data_sha256, restored.dataSha256);
  } finally { client.close(); await rm(directory, { recursive: true, force: true }); }
});

test("legacy SQL copy preserves profiles with absent or non-array SALN fields", async () => {
  const directory = await mkdtemp(join(tmpdir(), "saln-legacy-copy-shape-"));
  const client = createClient({ url: `file:${join(directory, "copy.db")}` });
  try {
    const documents = [
      { id: "without-records", path: "officials/without-records", data: typedFirestoreValue({ name: "Profile without records", agency: "EXECUTIVE", status: "active", unknownField: "retained" }) },
      { id: "opaque-records", path: "officials/opaque-records", data: typedFirestoreValue({ name: "Profile with opaque records", agency: "EXECUTIVE", status: "active", saln_records: { original: "retained" } }) },
    ];
    await writeCapture(directory, documents);
    const copy = await prepareLegacyCopy(directory);
    assert.equal(copy.documentCount, 2);
    assert.equal(copy.salnCount, 0);
    await client.batch(copy.statements, "write");
    const [saved] = (await client.execute("SELECT documents_json FROM legacy_firestore_captures")).rows;
    assert.deepEqual(JSON.parse(String(saved.documents_json)), documents);
    assert.equal((await client.execute("SELECT count(*) AS count FROM legacy_officials")).rows[0].count, 2);
    assert.equal((await client.execute("SELECT count(*) AS count FROM legacy_saln_records")).rows[0].count, 0);
    const [verification] = (await client.execute(copy.verificationSql)).rows;
    assert.equal(verification.source_data_matches, 1);
    assert.equal(verification.officials, 2);
    assert.equal(verification.saln_records, 0);
  } finally { client.close(); await rm(directory, { recursive: true, force: true }); }
});
