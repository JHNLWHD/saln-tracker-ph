import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { eq } from "drizzle-orm";
import { formatAmount, latestSummaryCandidates } from "../app/archive/financial";
import { exportPublicSnapshot } from "../app/archive/snapshot.server";
import { PersonProfile } from "../app/components/PersonProfile";
import { connectArchive } from "../app/db/client.server";
import { applyReviewedManifest, validateReviewedManifest, type ReviewedManifest } from "../app/db/manifests.server";
import { createDbArchive } from "../app/db/people.server";
import * as schema from "../app/db/schema";
import { validateReviewedSummary } from "../app/db/transcription-validation";
import type { DocumentStorage } from "../app/storage/objects.server";
import { migrateArchive, rollbackArchive } from "../scripts/migrate";

const review = { reviewedAt: "2026-10-02", reviewedBy: "private-reviewer@example.invalid" };
const person: ReviewedManifest = { id: "person-synthetic", version: 1, kind: "person", payload: {
  review, person: { id: "p", slug: "sample-person", canonicalName: "Sample Person", nameVariants: ["PERSON, SAMPLE"] }, jurisdictions: [], jurisdictionRelationships: [], constituencies: [], electoralTerms: [],
  offices: [{ id: "office", name: "Synthetic elected office", kind: "elected", included: true, jurisdictionId: null }],
  tenures: [{ id: "tenure", personId: "p", officeId: "office", electoralTermId: null, constituencyId: null, startDate: null, endDate: null, assumptionMethod: "unknown", verificationStatus: "verified", disputedFacts: [], citations: [{ id: "office-proof", title: "Synthetic office evidence", url: "https://example.org/office", publisher: "Test", type: "public_article", supports: ["person", "office"], publishedDate: null }] },
    { id: "previous-tenure", personId: "p", officeId: "office", electoralTermId: null, constituencyId: null, startDate: { value: "2010", precision: "year" }, endDate: { value: "2011", precision: "year" }, assumptionMethod: "unknown", verificationStatus: "verified", disputedFacts: [], citations: [{ id: "old-office-proof", title: "Synthetic past Tenure evidence", url: "https://example.org/past-office", publisher: "Test", type: "public_article", supports: ["person", "office", "startDate", "endDate"], publishedDate: null }] }],
} };

function summary(id: string): ReviewedManifest & { kind: "summary" } {
  return { id: `summary:${id}`, version: 1, kind: "summary", payload: { review, summary: { id: `summary-${id}`, filingId: id, currency: "PHP", totalAssets: "9007199254740993.01", totalLiabilities: "1.00", declaredNetWorth: "9007199254740992.01",
    sources: { totalAssets: { sourceDocumentId: `${id}-a`, location: "Total assets box, scan A" }, totalLiabilities: { sourceDocumentId: `${id}-b`, location: "Total liabilities box, scan B" }, declaredNetWorth: { sourceDocumentId: `${id}-b`, location: "Net worth box, scan B" } },
  } } };
}

const report: ReviewedManifest & { kind: "report" } = { id: "report:test", version: 1, kind: "report", payload: { review, report: { id: "report", personId: "p", title: "Synthetic SALN article", url: "https://example.org/article", publisher: "Test Publisher", publishedDate: { value: "2025", precision: "year" }, note: "An article, not a Source Document." } } };

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "saln-summary-"));
  const connection = connectArchive({ url: `file:${join(directory, "archive.db")}` });
  await migrateArchive(connection.db); await applyReviewedManifest(connection.db, person);
  const objects = new Map<string, Uint8Array>();
  const storage: DocumentStorage = { get: async hash => objects.get(hash) ?? null, async put(bytes, hash) { objects.set(hash, bytes); return { storageKey: `documents/sha256/${hash}`, created: true }; } };
  async function filing(id: string, date: string) {
    for (const page of ["a", "b"]) {
      const bytes = Buffer.from(`%PDF-1.7\nSynthetic ${id} ${page}\n%%EOF\n`), documentId = `${id}-${page}`;
      await applyReviewedManifest(connection.db, { id: `document:${documentId}`, version: 1, kind: "filing", payload: { review,
        filing: { id, personId: "p", filerName: "PERSON, SAMPLE", reportingDate: { value: date, precision: date.length === 4 ? "year" : "day" }, executionDate: null, receiptDate: null, supersedesFilingId: null },
        document: { id: documentId, filingId: id, fileName: `${documentId}.pdf`, mediaType: "application/pdf", byteSize: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex"), originalUrl: "https://example.org/source.pdf", provenanceType: "official_download", provenanceNote: "Synthetic fixture", officialReleaseDate: null, acquisitionDate: { value: "2026-10-02", precision: "day" }, archivePublicationDate: "2026-10-02T00:00:00.000Z", transcriptionLevel: "document_only" },
      } }, { bytes, storage });
    }
  }
  return { ...connection, storage, filing, async close() { connection.client.close(); await rm(directory, { recursive: true, force: true }); } };
}

test("cross-page summary keeps exact amounts, raw documents and replay stable while corrections remain append-only", async () => {
  const state = await setup();
  try {
    await state.filing("f1", "2024"); await state.filing("other", "2024-12-31");
    const originalDocuments = await state.db.select().from(schema.sourceDocuments), originalFilings = await state.db.select().from(schema.filings);
    await applyReviewedManifest(state.db, summary("f1"));
    const raw = await state.db.select().from(schema.financialSummaries);
    assert.equal((await applyReviewedManifest(state.db, summary("f1"))).status, "unchanged");
    const archive = createDbArchive(state.db), record = (await archive.findPersonBySlug("sample-person"))!;
    assert.ok(!JSON.stringify(record).includes('storageKey'));
    assert.equal(record.financialSummaries[0].totalAssets, "9007199254740993.01");
    assert.ok(record.sourceDocuments.filter(document => document.filingId === "f1").every(document => document.transcriptionLevel === "summary_totals"));
    assert.equal((await archive.findSourceDocument(record.sourceDocuments.find(document => document.id === "f1-a")!.sha256))?.transcriptionLevel, "summary_totals");
    assert.ok(record.sourceDocuments.filter(document => document.filingId === "other").every(document => document.transcriptionLevel === "document_only"));
    const html = renderToStaticMarkup(createElement(PersonProfile, { record }));
    assert.match(html, /₱9,007,199,254,740,993.01/); assert.match(html, /Total assets box, scan A/); assert.match(html, /Net worth box, scan B/);
    assert.doesNotMatch(html, /Declared net-worth timeline/); assert.equal((html.match(/Reporting periods in 2024/g) ?? []).length, 1);
    const correction: ReviewedManifest & { kind: "correction" } = { id: "correct-summary", version: 1, kind: "correction", payload: { review, target: { type: "financial_summary", id: "summary-f1" }, previousCorrectionId: null, reason: "Synthetic corrected reading", changes: { declaredNetWorth: "2.02" }, citations: [{ id: "summary-proof", title: "Synthetic source review", url: "https://example.org/review", publisher: "Test", type: "official_record", supports: ["declaredNetWorth"], publishedDate: null }] } };
    await applyReviewedManifest(state.db, correction);
    assert.equal((await archive.findPersonBySlug("sample-person"))?.financialSummaries[0].declaredNetWorth, "2.02");
    assert.deepEqual(await state.db.select().from(schema.financialSummaries), raw);
    assert.deepEqual(await state.db.select().from(schema.sourceDocuments), originalDocuments); assert.deepEqual(await state.db.select().from(schema.filings), originalFilings);
    const wrongSource = { ...correction, id: "wrong-source", payload: { ...correction.payload, previousCorrectionId: "correct-summary", changes: { sources: { ...summary("f1").payload.summary.sources, totalAssets: { sourceDocumentId: "other-a", location: "Wrong Filing" } } }, citations: [{ ...correction.payload.citations[0], id: "wrong-source-proof", supports: ["sources"] }] } };
    await assert.rejects(applyReviewedManifest(state.db, wrongSource), /own Filing/);
    assert.equal((await state.db.select().from(schema.manifestApplications).where(eq(schema.manifestApplications.id, "wrong-source"))).length, 0);
    const exported = await exportPublicSnapshot(state.db);
    assert.equal(exported.snapshot.data.financialSummaries[0].declaredNetWorth, "2.02"); assert.ok(!exported.snapshotJson.includes(review.reviewedBy));
    await rollbackArchive(state.client); await migrateArchive(state.db); assert.equal((await state.db.select().from(schema.financialSummaries)).length, 0);
  } finally { await state.close(); }
});

test("Secondary Reports neither create Filings nor close gaps, and sparse timelines preserve distinct same-year declarations", async () => {
  const state = await setup();
  try {
    await applyReviewedManifest(state.db, report);
    const archive = createDbArchive(state.db), empty = (await archive.findPersonBySlug("sample-person"))!;
    assert.equal(empty.filings.length, 0); assert.equal(empty.sourceDocuments.length, 0); assert.equal(empty.financialSummaries.length, 0);
    const emptyHtml = renderToStaticMarkup(createElement(PersonProfile, { record: empty }));
    assert.match(emptyHtml, /Related reporting - not a SALN filing/); assert.match(emptyHtml, /No SALN currently in the archive/); assert.match(emptyHtml, /Suggest a Source Document/);
    assert.doesNotMatch(emptyHtml, /Declared net-worth timeline/);
    for (const [id, date] of [["old", "2018"], ["recent", "2024"], ["distinct", "2024"]]) { await state.filing(id, date); await applyReviewedManifest(state.db, summary(id)); }
    await applyReviewedManifest(state.db, { id: "roster:test", version: 1, kind: "roster", payload: { review, scope: "executive", verifiedAsOf: "2026-10-02", members: [{ tenureId: "tenure", citations: [{ id: "current-proof", title: "Synthetic current roster evidence", url: "https://example.org/current", publisher: "Test", type: "official_record", supports: ["person", "office", "holdsOffice"], publishedDate: { value: "2026-10-02", precision: "day" } }] }] } });
    const record = (await archive.findPersonBySlug("sample-person"))!, html = renderToStaticMarkup(createElement(PersonProfile, { record }));
    assert.match(html, /Declared net-worth timeline/); assert.doesNotMatch(html, /2019|2020|2021|2022|2023/);
    assert.match(html, /Current included Tenures in reviewed rosters/); assert.match(html, /Previous included Tenures/); assert.equal(record.rosterMemberships?.[0].verifiedAsOf, "2026-10-02");
    const home = await archive.readHome(); assert.equal(home.rosters[0].rows[0].documentCount, 6); assert.equal(home.rosters[0].rows[0].summaryCount, 2); assert.equal(home.rosters[0].rows[0].latestSummary, null);
    assert.equal((html.match(/Reporting Date: <span>2024<\/span>/g) ?? []).length, 2); assert.equal((html.match(/Reporting periods in 2024/g) ?? []).length, 1);
    assert.ok(html.indexOf('Related reporting - not a SALN filing') > html.indexOf('SALN Filings'));
    assert.match(html, /Source Tip|Suggest a source/);
    const snapshot = await exportPublicSnapshot(state.db); assert.equal(snapshot.snapshot.data.secondaryReports.length, 1); assert.equal(snapshot.snapshot.data.filings.length, 3);
  } finally { await state.close(); }
});

test("financial trust boundary rejects numeric rounding, private fields and foreign sources; uncertain latest dates stay explicit", async () => {
  const state = await setup();
  try {
    const input = summary("f1"), valid = input.payload;
    for (const value of [null, 1, "1e3", "NaN", "1,000.00", "01.00", "1.0", "-0.00"]) assert.throws(() => validateReviewedSummary({ ...valid, summary: { ...valid.summary, totalAssets: value } }));
    assert.throws(() => validateReviewedSummary({ ...valid, privateContact: "private" }));
    assert.throws(() => validateReviewedManifest({ ...report, payload: { ...report.payload, report: { ...report.payload.report, url: "https://user:secret@example.org/report" } } }));
    await assert.rejects(applyReviewedManifest(state.db, input), /acquired Filing/);
    await state.filing("f1", "2024");
    await assert.rejects(applyReviewedManifest(state.db, { ...input, payload: { ...valid, summary: { ...valid.summary, sources: { ...valid.summary.sources, totalAssets: { sourceDocumentId: "absent", location: "No source" } } } } }), /acquired Source Document/);
    assert.equal((await state.db.select().from(schema.financialSummaries)).length, 0);
    assert.equal(formatAmount("-9007199254740993.01"), "-₱9,007,199,254,740,993.01");
    const item = { ...valid.summary, reviewedAt: review.reviewedAt };
    assert.equal(latestSummaryCandidates([{ summary: item, reportingDate: { value: "2024", precision: "year" } }, { summary: item, reportingDate: { value: "2024-12-31", precision: "day" } }]).length, 2);
    assert.equal(latestSummaryCandidates([{ summary: item, reportingDate: { value: "2023", precision: "year" } }, { summary: item, reportingDate: { value: "2024-02", precision: "month" } }]).length, 1);
  } finally { await state.close(); }
});

test("checked-in summary and report examples preserve cross-page references and explicit transcription scope", async () => {
  const base = new URL("../data/examples/hontiveros-2024-local-verification/", import.meta.url);
  const input = validateReviewedManifest(JSON.parse(await readFile(new URL("0006-reviewed-summary.json", base), "utf8")));
  assert.equal(input.kind, "summary"); if (input.kind !== "summary") throw new Error("Expected summary");
  assert.notEqual(input.payload.summary.sources.totalAssets.sourceDocumentId, input.payload.summary.sources.declaredNetWorth.sourceDocumentId);
  assert.deepEqual([input.payload.summary.totalAssets, input.payload.summary.totalLiabilities, input.payload.summary.declaredNetWorth], ["19884098.21", "897840.00", "18986258.21"]);
  assert.equal(validateReviewedManifest(JSON.parse(await readFile(new URL("0007-related-reporting.json", base), "utf8"))).kind, "report");
});
