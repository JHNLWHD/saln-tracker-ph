import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Bytes, GeoPoint, Timestamp } from "firebase/firestore";
import type { v1 } from "firebase-admin/firestore";
import { canonicalJson } from "../app/db/canonical";
import type { ReviewedIdentities } from "../app/db/identity-validation";
import { buildLegacyAudit, captureDocuments, inventoryPdfs } from "../scripts/legacy-audit";
import { exportDatabaseDocuments, readCapture, sha256, typedFirestoreValue } from "../scripts/legacy-capture";

const root = "projects/saln-tracker-ph/databases/(default)/documents";
const readTime = "2026-10-01T19:00:00.000Z";
const privateCanary = "PRIVATE-CONTACT-SOURCE-TIP-DO-NOT-PUBLISH";
type Reader = Pick<InstanceType<typeof v1.FirestoreClient>, "listCollectionIdsAsync" | "listDocumentsAsync">;
const identities: ReviewedIdentities = { review: { reviewedAt: "2026-10-02", reviewedBy: privateCanary }, matches: [], documents: [],
  legacyPeople: [{ person: { id: "stable-person", slug: "profile", canonicalName: "Public Name", nameVariants: [] }, identifiers: ["former-id"], slugs: ["profile", "former-profile"], sourceUrl: "https://example.org/official/profile" }] };

test("database export consumes complete iterators at one read time and reaches subcollections under missing parents", async () => {
  const calls: { parent: string; readTime: unknown; showMissing?: boolean }[] = [];
  const reader: Reader = {
    async *listCollectionIdsAsync(request) {
      calls.push({ parent: request!.parent!, readTime: request!.readTime });
      if (request?.parent === root) { yield "officials"; yield "source_tips"; }
      if (request?.parent === `${root}/officials/missing-parent`) yield "nested";
    },
    async *listDocumentsAsync(request): ReturnType<Reader["listDocumentsAsync"]> {
      assert.equal(request?.showMissing, true);
      assert.equal(request?.mask, undefined);
      assert.equal(request?.orderBy, undefined);
      calls.push({ parent: request!.parent!, readTime: request!.readTime, showMissing: request?.showMissing! });
      if (request?.collectionId === "officials") {
        yield { name: `${root}/officials/profile`, fields: { publicName: { stringValue: "Public Name" }, integer: { integerValue: "9223372036854775807" },
          bytes: { bytesValue: Buffer.from([0, 255]) }, special: { doubleValue: Infinity }, negativeZero: { doubleValue: -0 }, timestamp: { timestampValue: { seconds: "1780344000", nanos: 123456789 } } }, createTime: { seconds: "1700000000" } };
        yield { name: `${root}/officials/missing-parent` }; // Returned by showMissing.
      }
      if (request?.collectionId === "nested") yield { name: `${root}/officials/missing-parent/nested/child`, fields: { contact: { stringValue: privateCanary } } };
      if (request?.collectionId === "source_tips") yield { name: `${root}/source_tips/private`, fields: { contact: { stringValue: privateCanary } } };
    },
  };
  const result = await exportDatabaseDocuments(reader, readTime);
  assert.equal(result.documents.length, 4);
  assert.equal(result.collections.length, 3);
  assert.ok(result.documents.some(row => row.name === `${root}/officials/missing-parent/nested/child`));
  assert.ok(JSON.stringify(result).includes(privateCanary)); // Complete raw export; never a public report.
  const publicRow = result.documents.find(row => row.name === `${root}/officials/profile`)!;
  assert.ok(JSON.stringify(publicRow).includes('"integerValue":"9223372036854775807"'));
  assert.ok(JSON.stringify(publicRow).includes('"bytesValue":"AP8="'));
  assert.ok(JSON.stringify(publicRow).includes('"doubleValue":"Infinity"'));
  assert.ok(JSON.stringify(publicRow).includes('"doubleValue":"-0"'));
  assert.ok(JSON.stringify(publicRow).includes('"nanos":123456789'));
  assert.ok(calls.every(call => canonicalJson(call.readTime) === canonicalJson(calls[0].readTime)));
  const failing: Reader = { ...reader, async *listCollectionIdsAsync(request) { if (request?.parent?.endsWith("missing-parent")) throw new Error("Synthetic permission failure"); yield* reader.listCollectionIdsAsync(request); } };
  await assert.rejects(exportDatabaseDocuments(failing, readTime), /permission failure/);
});

test("SDK typed capture retains precise timestamps, bytes and non-finite values", () => {
  const value = typedFirestoreValue({ date: new Timestamp(123, 456789), point: new GeoPoint(7, 122), bytes: Bytes.fromUint8Array(new Uint8Array([0, 255])), numbers: [NaN, Infinity, -Infinity, -0] });
  const json = canonicalJson(value);
  assert.match(json, /"nanoseconds":456789/);
  assert.match(json, /"base64":"AP8="/);
  assert.match(json, /"latitude":7/);
  for (const expected of ["NaN", "Infinity", "-Infinity", "-0"]) assert.ok(json.includes(`"value":"${expected}"`));
  assert.throws(() => typedFirestoreValue(new Date()), /Unsupported/);
});

test("audit keeps legacy dates, statuses, amounts, contacts and Source Tips outside public fields", async () => {
  const directory = await mkdtemp(join(tmpdir(), "saln-audit-test-"));
  try {
    await mkdir(join(directory, "saln"));
    const bytes = Buffer.from("%PDF-1.7\nSynthetic audit PDF only.\n%%EOF\n");
    await writeFile(join(directory, "saln", "test.pdf"), bytes);
    const documents = [
      { path: "officials/profile", data: { name: "Public Name", contact: privateCanary, position: "Appointed role", term_end: "2099-12-31", saln_records: [
        { year: 2024, date_filed: "2024-12-31", status: "submitted", total_assets: 987654.32, net_worth: 987650.12, source_url: "https://saln.bettergov.ph/saln/test.pdf", privateContact: privateCanary },
        { year: 2025, date_filed: "2025-12-31", status: "submitted", source_url: `https://www.rappler.com/report?contact=${privateCanary}` },
        { year: 2025, source_url: `https://user:${privateCanary}@example.org/file` },
        { year: 2023, source_url: "https://saln.bettergov.ph/saln/absent.pdf" },
      ] } },
      { path: "officials/unmapped", data: { name: privateCanary, saln_records: {} } },
      { path: "source_tips/private", data: { contact: privateCanary, saln_records: [{ year: 2025, source_url: privateCanary }] } },
    ];
    const report = await buildLegacyAudit(documents, directory, identities);
    assert.equal(report.counts.legacyEntries, 4);
    assert.equal(report.counts.reviewQueueEntries, 4);
    assert.equal(report.counts.identityDocumentReviewQueue, 1);
    assert.equal(report.counts.acquiredSourceDocumentEntries, 0);
    assert.equal(report.counts.secondaryReports, 0); // An article link alone is not a reviewed Secondary Report.
    assert.equal(report.counts.outOfScopeRecords, 0); // Appointed-role text does not rule out elected service.
    assert.equal(report.counts.unresolvedPdfReferences, 1);
    assert.equal(report.counts.genericSubmittedStatuses, 2);
    assert.equal(report.counts.yearEndDateInputs, 2);
    assert.equal(report.counts.canonicalProfileRedirects, 1);
    const json = JSON.stringify(report);
    assert.doesNotMatch(json, /987654|987650|2099-12-31|2024-12-31|2025-12-31|date_filed|net_worth|total_assets|source_url|source_tips|privateContact/);
    assert.ok(!json.includes(privateCanary));
    const data = { people: [{ id: "stable-person" }], filings: [{ id: "reviewed-filing", personId: "stable-person" }], sourceDocuments: [{ id: "reviewed-document", filingId: "reviewed-filing", sha256: sha256(bytes), byteSize: bytes.length, mediaType: "application/pdf" }] };
    const snapshot = { schemaVersion: 1, data, version: sha256(JSON.stringify({ schemaVersion: 1, data })) };
    const reviewed = await buildLegacyAudit(documents, directory, identities, snapshot);
    assert.equal(reviewed.counts.acquiredSourceDocumentEntries, 1);
    assert.equal(reviewed.counts.reviewQueueEntries, 3);
    assert.deepEqual(reviewed.entries.find(row => row.classification === "acquired_source_document")?.sourceDocumentIds, ["reviewed-document"]);
    assert.equal(reviewed.entries.find(row => row.classification === "acquired_source_document")?.candidateReportingPeriod, "2024");
    assert.ok(!JSON.stringify(reviewed).includes(privateCanary));
    await assert.rejects(buildLegacyAudit(documents, directory, identities, { ...snapshot, version: "a".repeat(64) }), /integrity/);
    assert.deepEqual(await buildLegacyAudit(documents, directory, identities, snapshot), reviewed);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("private capture checksums, counts and provenance are checked before audit decoding", async () => {
  const directory = await mkdtemp(join(tmpdir(), "saln-capture-test-"));
  try {
    const tree = { format: "firestore-document-tree/v1", databaseRoot: root, readTime, collections: [`${root}/officials`], documents: [
      { name: `${root}/officials/profile`, fields: { name: { stringValue: "Public Name" }, saln_records: { arrayValue: { values: [] } }, contact: { stringValue: privateCanary } } },
      { name: `${root}/officials/missing-parent` },
      { name: `${root}/officials/missing-parent/nested/child`, fields: { contact: { stringValue: privateCanary } } },
      { name: `${root}/officials/empty`, createTime: { seconds: '1700000000' } },
    ] };
    const body = JSON.stringify(tree);
    await writeFile(join(directory, "database-documents.json"), body);
    const capture = { format: "legacy-capture/v1", projectId: "saln-tracker-ph", database: "(default)", writesPerformed: false, scope: "database_document_tree", completeDatabaseDocumentTree: true,
      startedAt: readTime, finishedAt: readTime, readTime, documentCount: 4, dataSha256: sha256(canonicalJson(tree)), rawFiles: [{ file: "database-documents.json", sha256: sha256(body), byteSize: Buffer.byteLength(body) }] };
    await writeFile(join(directory, "capture.json"), JSON.stringify(capture));
    const result = await captureDocuments(directory);
    assert.equal(result.documents.length, 3);
    assert.ok(!result.documents.some(row => row.path === 'officials/missing-parent'));
    assert.ok(result.documents.some(row => row.path === 'officials/missing-parent/nested/child'));
    assert.deepEqual(result.documents.find(row => row.path === 'officials/empty')?.data, {});
    await mkdir(join(directory, 'public/saln'), { recursive: true });
    const audit = await buildLegacyAudit(result.documents, join(directory, 'public'), identities);
    assert.equal(audit.counts.legacyPeople, 2); assert.equal(audit.documentReviewQueue.length, 1);
    assert.equal(result.acquisition.completeDatabaseDocumentTree, true);
    assert.ok(!JSON.stringify(result.acquisition).includes(privateCanary));
    await writeFile(join(directory, "database-documents.json"), body + " ");
    await assert.rejects(readCapture(directory), /integrity/);
    await writeFile(join(directory, "capture.json"), JSON.stringify({ ...capture, rawFiles: [{ ...capture.rawFiles[0], file: "../outside.json" }] }));
    await assert.rejects(readCapture(directory), /incomplete|Unsafe/);
    await writeFile(join(directory, "capture.json"), JSON.stringify({ ...capture, documentCount: 2 }));
    await writeFile(join(directory, "database-documents.json"), body);
    await assert.rejects(captureDocuments(directory), /count/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("dated committed audit covers every repository PDF and keeps all unsupported legacy entries in review", async () => {
  const report = JSON.parse(await readFile(new URL("../data/audits/legacy-2026-10-02/audit.json", import.meta.url), "utf8"));
  const { version, ...content } = report;
  assert.equal(version, sha256(canonicalJson(content)));
  assert.equal(report.acquisition.scope, "public_reader");
  assert.equal(report.acquisition.completeDatabaseDocumentTree, false);
  assert.equal(report.counts.legacyPeople, 49);
  assert.equal(report.counts.legacyEntries, 129);
  assert.equal(report.counts.reviewQueueEntries, 129);
  assert.equal(report.counts.profileKeys, 56);
  assert.equal(report.counts.canonicalProfileRedirects, 8);
  assert.equal(report.counts.formerIdentifiers, 42);
  const inventory = await inventoryPdfs(new URL("../public", import.meta.url).pathname);
  assert.equal(inventory.length, 51);
  assert.deepEqual(report.pdfs.map(({ candidateAssociations: _candidates, ...file }: { candidateAssociations: unknown; path: string }) => file), inventory);
  assert.equal(report.counts.repositoryPdfBytes, 472348069);
  assert.ok(report.entries.every((row: { classification: string }) => row.classification === "unverified_review_input"));
  assert.ok(report.pdfs.every((row: { candidateAssociations: unknown[] }) => row.candidateAssociations.length === 1));
});
