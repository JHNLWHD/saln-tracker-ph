import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalJson } from "../app/db/canonical";
import { resolveIdentity } from "../app/db/identities.server";
import { validateReviewedManifest } from "../app/db/manifests.server";
import type { ReviewedIdentities } from "../app/db/identity-validation";
import { validateReviewedPerson } from "../app/db/validation";
import { readCapture, sha256 } from "./legacy-capture";

export interface LegacyAuditDocument { path: string; data: unknown }
const field = (value: unknown, key: string): unknown => value && typeof value === "object" ? Reflect.get(value, key) : undefined;
const string = (value: unknown): string | null => typeof value === "string" ? value : null;

/** Decode audit inputs, never import them as Archive records. Raw captures retain every type. */
function decode(value: unknown, native: boolean): unknown {
  if (!value || typeof value !== "object") return null;
  const type = native ? undefined : field(value, "type");
  if (type === "string" || type === "boolean" || type === "number") return field(value, "value");
  if (type === "null" || field(value, "nullValue") !== undefined) return null;
  if (native && field(value, "stringValue") !== undefined) return field(value, "stringValue");
  if (native && field(value, "booleanValue") !== undefined) return field(value, "booleanValue");
  if (native && field(value, "integerValue") !== undefined) return Number(field(value, "integerValue"));
  if (native && field(value, "doubleValue") !== undefined) return Number(field(value, "doubleValue"));
  const array = native ? field(field(value, "arrayValue"), "values") : type === "array" ? field(value, "values") : undefined;
  if (Array.isArray(array)) return array.map(row => decode(row, native));
  if ((native && field(value, "arrayValue") !== undefined) || type === "array") return [];
  const map = native ? field(field(value, "mapValue"), "fields") : type === "map" ? field(value, "fields") : undefined;
  if (map && typeof map === "object") return Object.fromEntries(Object.entries(map).map(([key, child]) => [key, decode(child, native)]));
  return null;
}

export async function captureDocuments(directory: string) {
  const { capture, files } = await readCapture(directory);
  const docs: LegacyAuditDocument[] = [];
  if (capture.scope === "public_reader") {
    const first = field(files.get("officials-read-1.typed.json"), "documents"), second = field(files.get("officials-read-2.typed.json"), "documents");
    if (!Array.isArray(first) || !Array.isArray(second) || first.length !== capture.documentCount || sha256(canonicalJson(first)) !== capture.dataSha256 || canonicalJson(first) !== canonicalJson(second)) throw new Error("Capture document count or data digest differs");
    for (const row of first) docs.push({ path: String(field(row, "path")), data: decode(field(row, "data"), false) });
  } else {
    const tree = files.get("database-documents.json"), rows = field(tree, "documents"), root = `projects/${capture.projectId}/databases/${capture.database}/documents`;
    if (!Array.isArray(rows) || rows.length !== capture.documentCount || sha256(canonicalJson(tree)) !== capture.dataSha256 || field(tree, "databaseRoot") !== root || field(tree, "readTime") !== capture.readTime) throw new Error("Database capture count, scope or digest differs");
    for (const row of rows) {
      const name = string(field(row, "name"));
      if (!name?.startsWith(`${root}/`)) throw new Error("Database capture has an invalid document path");
      // showMissing placeholders remain in the raw tree for traversal, but are not documents.
      if (field(row, 'fields') === undefined && field(row, 'createTime') === undefined && field(row, 'updateTime') === undefined) continue;
      docs.push({ path: name.slice(root.length + 1), data: decode({ mapValue: { fields: field(row, "fields") ?? {} } }, true) });
    }
  }
  if (new Set(docs.map(row => row.path)).size !== docs.length) throw new Error("Capture contains duplicate document paths");
  return { acquisition: { scope: capture.scope, completeDatabaseDocumentTree: capture.scope === "database_document_tree", startedAt: capture.startedAt, finishedAt: capture.finishedAt,
    readTime: capture.readTime, dataSha256: capture.dataSha256, rawFiles: capture.rawFiles.map((row: { sha256: string; byteSize: number }) => ({ sha256: row.sha256, byteSize: row.byteSize })), writesPerformed: false }, documents: docs };
}

export async function inventoryPdfs(publicDirectory: string) {
  const files: { path: string; publicPath: string; byteSize: number; sha256: string; pdfHeader: boolean }[] = [];
  async function visit(directory: string, relative: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name), name = `${relative}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error("Repository PDF inventory cannot follow symbolic links");
      if (entry.isDirectory()) await visit(path, name);
      else if (entry.isFile() && /\.pdf$/i.test(entry.name)) {
        const before = await stat(path), hash = createHash("sha256");
        let byteSize = 0, header = Buffer.alloc(0);
        for await (const chunk of createReadStream(path)) { hash.update(chunk); byteSize += chunk.length; if (header.length < 5) header = Buffer.concat([header, chunk]).subarray(0, 5); }
        const after = await stat(path);
        if (byteSize !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error("Repository PDF changed during inventory");
        files.push({ path: `public${name}`, publicPath: name, byteSize, sha256: hash.digest("hex"), pdfHeader: header.toString("ascii") === "%PDF-" });
      }
    }
  }
  await visit(join(publicDirectory, "saln"), "/saln");
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/** Only whitelisted audit fields leave the private raw input. No Archive write API is used. */
export async function buildLegacyAudit(documents: LegacyAuditDocument[], publicDirectory: string, identities: ReviewedIdentities, reviewedSnapshot?: unknown, canonicalProfiles: { id: string; slug: string }[] = []) {
  const pdfs = await inventoryPdfs(publicDirectory);
  const people = new Map<string, string>();
  for (const row of identities.legacyPeople) for (const key of row.slugs) {
    if (people.has(key) && people.get(key) !== row.person.id) throw new Error("Reviewed legacy identity keys collide");
    people.set(key, row.person.id);
  }
  const canonicalPeople = new Map([...people].map(([key, id]) => [key, resolveIdentity(id, identities.matches)]));
  const data = field(reviewedSnapshot, "data");
  if (reviewedSnapshot && (field(reviewedSnapshot, "schemaVersion") !== 1 || !data || sha256(JSON.stringify({ schemaVersion: 1, data })) !== field(reviewedSnapshot, "version"))) throw new Error("Reviewed snapshot integrity check failed");
  const arrayField = (value: unknown, key: string): unknown[] => { const rows = field(value, key); return Array.isArray(rows) ? rows : []; };
  const profileSlugs = new Map([...identities.legacyPeople.map(row => row.person), ...canonicalProfiles].map(row => [row.id, row.slug]));
  const eligibleIds = new Set(arrayField(data, "people").map(row => field(row, "id")));
  const filings = arrayField(data, "filings");
  const sourceDocuments = arrayField(data, "sourceDocuments");
  const records = documents.filter(row => /^officials\/[^/]+$/.test(row.path));
  const documentReviewQueue = records.flatMap(row => {
    const reasons = [];
    if (!canonicalPeople.has(row.path.slice("officials/".length))) reasons.push("No explicit reviewed legacy identity mapping.");
    if (!Array.isArray(field(row.data, "saln_records"))) reasons.push("Legacy SALN entries are absent or are not an array.");
    return reasons.length ? [{ id: `legacy-person-${sha256(row.path).slice(0, 20)}`, reasons }] : [];
  }).sort((a, b) => a.id.localeCompare(b.id));
  const entries = records.flatMap(document => arrayField(document.data, "saln_records").map((record, index) => {
    const key = document.path.slice("officials/".length), personId = canonicalPeople.get(key) ?? null;
    const sourceUrl = string(field(record, "source_url"));
    let candidatePdf: typeof pdfs[number] | undefined;
    let candidateKind = "unknown_link";
    if (sourceUrl) {
      try {
        const url = new URL(sourceUrl, "https://saln.bettergov.ph");
        if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) {
          if (!url.port && ["saln.bettergov.ph", "saln-tracker-ph.netlify.app"].includes(url.hostname) && url.pathname.startsWith("/saln/")) {
            candidateKind = "repository_pdf";
            candidatePdf = pdfs.find(row => row.publicPath === decodeURIComponent(url.pathname));
          } else if (["www.abs-cbn.com", "www.rappler.com", "www.gmanetwork.com", "pcij.org"].includes(url.hostname)) candidateKind = "report_link";
          else candidateKind = "external_link";
        }
      } catch { /* Malformed or unsafe links remain review inputs without publishing the URL. */ }
    }
    const acquiredIds = candidatePdf?.pdfHeader && personId && eligibleIds.has(personId) ? sourceDocuments.filter(source => field(source, "sha256") === candidatePdf.sha256 && field(source, "mediaType") === "application/pdf" && field(source, "byteSize") === candidatePdf.byteSize && filings.some(filing => field(filing, "id") === field(source, "filingId") && field(filing, "personId") === personId)).map(row => String(field(row, "id"))).sort() : [];
    const year = field(record, "year");
    return { id: `legacy-entry-${sha256(`${document.path}:${index}`).slice(0, 20)}`, candidatePersonId: personId,
      candidateReportingPeriod: Number.isInteger(year) && Number(year) >= 1900 && Number(year) <= 2100 ? String(year) : null,
      candidateKind, repositoryPdfPath: candidatePdf?.publicPath ?? null,
      classification: acquiredIds.length ? "acquired_source_document" : "unverified_review_input", sourceDocumentIds: acquiredIds,
      reason: acquiredIds.length ? "Exact repository bytes are already attached to a reviewed Source Document for the explicitly matched Person. Legacy amounts, status and dates are not adopted." : "Identity, link attribution, document custody and Reporting Date require source review. Legacy amounts, status and dates are not adopted.",
      genericSubmittedStatus: field(record, "status") === "submitted", yearEndDateInput: field(record, "date_filed") === `${year}-12-31` };
  })).sort((a, b) => a.id.localeCompare(b.id));
  const inventory = pdfs.map(file => ({ ...file, candidateAssociations: entries.filter(entry => entry.repositoryPdfPath === file.publicPath).map(entry => ({ entryId: entry.id, personId: entry.candidatePersonId, reportingPeriod: entry.candidateReportingPeriod })) }));
  const profileKeys = new Set(identities.legacyPeople.flatMap(row => row.slugs));
  const allPersonIds = new Set([...identities.legacyPeople.map(row => row.person.id), ...identities.matches.map(row => row.toPersonId)]);
  const survivors = new Set([...allPersonIds].map(id => resolveIdentity(id, identities.matches)));
  return { classification: "Non-canonical migration audit", metadataPromotion: "None. Candidate periods and associations are review inputs, not Filings or Verified Tenures.",
    counts: { legacyPeople: records.length, reviewedLegacyIdentityRecords: identities.legacyPeople.length, explicitIdentityMatches: identities.matches.length,
      unmergedLegacyIdentityRecords: identities.legacyPeople.length - identities.matches.filter(row => identities.legacyPeople.some(person => person.person.id === row.fromPersonId)).length,
      referencedPersonRecords: allPersonIds.size, survivingPersonIdentities: survivors.size,
      profileKeys: profileKeys.size, canonicalProfileRedirects: [...survivors].every(id => profileSlugs.has(id)) ? [...profileKeys].filter(key => profileSlugs.get(canonicalPeople.get(key)!) !== key).length : null,
      formerIdentifiers: identities.legacyPeople.reduce((sum, row) => sum + row.identifiers.length, 0), legacyEntries: entries.length,
      candidatePersonEntryRelationships: entries.filter(row => row.candidatePersonId).length, candidatePdfEntryRelationships: entries.filter(row => row.repositoryPdfPath).length,
      repositoryPdfs: inventory.length, repositoryPdfBytes: inventory.reduce((sum, row) => sum + row.byteSize, 0), repositoryDistinctChecksums: new Set(inventory.map(row => row.sha256)).size,
      unreferencedPdfs: inventory.filter(row => !row.candidateAssociations.length).length, unresolvedPdfReferences: entries.filter(row => row.candidateKind === "repository_pdf" && !row.repositoryPdfPath).length,
      acquiredSourceDocumentEntries: entries.filter(row => row.classification === "acquired_source_document").length, secondaryReports: 0, outOfScopeRecords: 0,
      reviewQueueEntries: entries.filter(row => row.classification === "unverified_review_input").length, identityDocumentReviewQueue: documentReviewQueue.length, genericSubmittedStatuses: entries.filter(row => row.genericSubmittedStatus).length,
      yearEndDateInputs: entries.filter(row => row.yearEndDateInput).length },
    pdfs: inventory, documentReviewQueue, entries: entries.map(({ genericSubmittedStatus: _status, yearEndDateInput: _date, ...entry }) => entry) };
}

async function main() {
  const [directory, output, snapshotPath] = process.argv.slice(2);
  if (!directory || !output || process.argv.length > 5) throw new Error("Usage: archive:audit-legacy -- capture-directory public-report-directory [reviewed-snapshot.json]");
  const source = await captureDocuments(directory);
  const manifest = validateReviewedManifest(JSON.parse(await readFile("data/reviewed/0003-legacy-identities.json", "utf8")));
  if (manifest.kind !== "identities") throw new Error("Expected reviewed identities");
  const reviewedSnapshot = snapshotPath ? JSON.parse(await readFile(snapshotPath, "utf8")) : undefined;
  const canonicalProfiles = [];
  for (const file of ["0001-ferdinand-marcos-jr.json", "0002-risa-hontiveros.json"]) canonicalProfiles.push(validateReviewedPerson(JSON.parse(await readFile(join("data/reviewed", file), "utf8"))).person);
  const content = { schemaVersion: 1, acquisition: source.acquisition, ...await buildLegacyAudit(source.documents, "public", manifest.payload, reviewedSnapshot, canonicalProfiles) };
  const report = { ...content, version: sha256(canonicalJson(content)) };
  await mkdir(output, { recursive: true });
  await writeFile(join(output, "audit.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ output, scope: source.acquisition.scope, version: report.version, counts: report.counts }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error("Legacy audit failed; no reviewed metadata or production data was changed."); process.exitCode = 1; });
