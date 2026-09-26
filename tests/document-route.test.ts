import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { closeArchive } from "../app/archive/archive.server";
import { connectArchive } from "../app/db/client.server";
import { importReviewedPerson } from "../app/db/people.server";
import { importReviewedFiling } from "../app/db/filings.server";
import type { ReviewedFiling } from "../app/db/filing-validation";
import { tenures } from "../app/db/schema";
import { createLocalDocumentStorage, documentStorageKey } from "../app/storage/objects.server";
import { migrateArchive } from "../scripts/migrate";
import { loader } from "../app/routes/documents.$sha256";

test("public document route serves reviewed exact bytes, download headers and conditional requests while hiding orphan objects", async () => {
  const directory = await mkdtemp(join(tmpdir(), "saln-document-route-"));
  const url = `file:${join(directory, "archive.db")}`;
  const objects = join(directory, "objects");
  const { client, db } = connectArchive({ url });
  const env = { ARCHIVE_ADAPTER: "turso", TURSO_DATABASE_URL: url, ARCHIVE_STORAGE: "local", ARCHIVE_OBJECT_DIR: objects };
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  const bytes = Buffer.from("%PDF-1.7\nSynthetic route test document.\n%%EOF\n");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const source: ReviewedFiling = {
    review: { reviewedAt: "2026-09-26", reviewedBy: "Synthetic route check" },
    filing: { id: "test-filing", personId: "person-ferdinand-marcos-jr", filerName: "SYNTHETIC TEST ONLY", reportingDate: { value: "2020", precision: "year" }, executionDate: null, receiptDate: null, supersedesFilingId: null },
    document: { id: "test-document", filingId: "test-filing", fileName: "test source.pdf", mediaType: "application/pdf", byteSize: bytes.byteLength, sha256, originalUrl: "https://example.org/test-source.pdf", provenanceType: "official_download", provenanceNote: "Synthetic fixture, never public source evidence.", officialReleaseDate: null, acquisitionDate: { value: "2026-09-26", precision: "day" }, archivePublicationDate: "2026-09-26T00:00:00.000Z", transcriptionLevel: "document_only" },
  };
  const request = (hash = sha256, query = "", options: RequestInit = {}) => loader({ request: new Request(`http://localhost/documents/${hash}${query}`, options), params: { sha256: hash }, context: {} });
  const status = (expected: number) => (error: unknown) => error instanceof Response && error.status === expected;
  try {
    Object.assign(process.env, env);
    await migrateArchive(db);
    const storage = createLocalDocumentStorage(objects);
    await storage.put(bytes, sha256, "application/pdf");
    await assert.rejects(request(), status(404)); // Storage alone does not publish an object.
    await assert.rejects(request("not-a-checksum"), status(404));
    await importReviewedPerson(db, JSON.parse(await readFile(new URL("../data/reviewed/0001-ferdinand-marcos-jr.json", import.meta.url), "utf8")));
    await importReviewedFiling(db, source, bytes, storage);
    const response = await request();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "application/pdf");
    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
    assert.match(response.headers.get("Content-Disposition")!, /^inline; filename\*=UTF-8''test%20source.pdf$/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    assert.match((await request(sha256, "?download=1")).headers.get("Content-Disposition")!, /^attachment;/);
    assert.equal((await request(sha256, "", { method: "HEAD" })).body, null);
    assert.equal((await request(sha256, "", { headers: { "If-None-Match": `"${sha256}"` } })).status, 304);
    await db.update(tenures).set({ verificationStatus: "unverified" });
    await assert.rejects(request(), status(404));
    await db.update(tenures).set({ verificationStatus: "verified" }).where(eq(tenures.personId, source.filing.personId));
    await rm(join(objects, documentStorageKey(sha256)));
    await assert.rejects(request(), status(503));
  } finally {
    await closeArchive();
    client.close();
    await rm(directory, { recursive: true, force: true });
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
