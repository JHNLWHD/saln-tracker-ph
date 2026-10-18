import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalJson } from "../app/db/canonical";
import { captureDocuments } from "./legacy-audit";
import { readCapture, sha256 } from "./legacy-capture";

// Operator-only copy. These tables never establish reviewed Archive records.
export const legacyCopySchema = [
  `CREATE TABLE IF NOT EXISTS legacy_firestore_captures (
    data_sha256 TEXT PRIMARY KEY NOT NULL CHECK(length(data_sha256) = 64),
    project_id TEXT NOT NULL CHECK(project_id = 'saln-tracker-ph'),
    scope TEXT NOT NULL CHECK(scope = 'public_reader'),
    captured_at TEXT NOT NULL,
    document_count INTEGER NOT NULL CHECK(document_count >= 0),
    capture_json TEXT NOT NULL CHECK(json_valid(capture_json)),
    documents_json TEXT NOT NULL CHECK(json_valid(documents_json) AND json_type(documents_json) = 'array' AND json_array_length(documents_json) = document_count)
  )`,
  `CREATE VIEW IF NOT EXISTS legacy_officials AS
    SELECT c.data_sha256 AS capture_sha256, json_extract(d.value, '$.id') AS id,
      json_extract(d.value, '$.path') AS firestore_path,
      json_extract(d.value, '$.data.fields.name.value') AS name,
      json_extract(d.value, '$.data.fields.slug.value') AS slug,
      json_extract(d.value, '$.data.fields.position.value') AS position,
      json_extract(d.value, '$.data.fields.agency.value') AS agency,
      json_extract(d.value, '$.data.fields.term_start.value') AS term_start,
      json_extract(d.value, '$.data.fields.term_end.value') AS term_end,
      json_extract(d.value, '$.data.fields.status.value') AS legacy_status,
      'unreviewed_legacy' AS review_status, d.value AS raw_document_json
    FROM legacy_firestore_captures c, json_each(c.documents_json) d`,
  `CREATE VIEW IF NOT EXISTS legacy_saln_records AS
    SELECT o.capture_sha256, o.id AS official_id, o.name, s.key AS record_index,
      json_extract(s.value, '$.fields.year.value') AS year,
      json_extract(s.value, '$.fields.total_assets.value') AS total_assets,
      json_extract(s.value, '$.fields.total_liabilities.value') AS total_liabilities,
      json_extract(s.value, '$.fields.net_worth.value') AS net_worth,
      json_extract(s.value, '$.fields.date_filed.value') AS legacy_date_filed,
      json_extract(s.value, '$.fields.status.value') AS legacy_status,
      json_extract(s.value, '$.fields.source_url.value') AS source_url,
      json_extract(s.value, '$.fields.source_description.value') AS source_description,
      json_extract(s.value, '$.fields.assets') AS assets_json,
      json_extract(s.value, '$.fields.liabilities') AS liabilities_json,
      'unreviewed_legacy' AS review_status, s.value AS raw_record_json
    FROM legacy_officials o, json_each(o.raw_document_json, '$.data.fields.saln_records.values') s`,
];

/** SQL literals only; never interpolate this output into a shell command. */
function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export async function prepareLegacyCopy(directory: string) {
  const { capture, files } = await readCapture(directory);
  if (capture.scope !== "public_reader") throw new Error("This copy accepts only the public application collection; use a private destination for other collections");
  // Reuse the existing hash, count, duplicate-path and matching-read validation.
  const decoded = await captureDocuments(directory);
  const documentFile = files.get("officials-read-1.typed.json");
  const documents: unknown = documentFile && typeof documentFile === "object" ? Reflect.get(documentFile, "documents") : undefined;
  if (!Array.isArray(documents)) throw new Error("Capture documents are missing");
  for (const document of documents) {
    if (!document || typeof document !== "object" || typeof document.id !== "string" || document.path !== `officials/${document.id}` || document.id.includes("/") || !document.id) throw new Error("Unexpected application document path");
  }
  // Keep the typed source intact. Views expose convenient values without replacing the raw copy.
  const documentsJson = canonicalJson(documents);
  if (sha256(documentsJson) !== capture.dataSha256) throw new Error("Source data checksum differs");
  const insert = `INSERT INTO legacy_firestore_captures
    (data_sha256, project_id, scope, captured_at, document_count, capture_json, documents_json)
    VALUES (${literal(capture.dataSha256)}, ${literal(capture.projectId)}, ${literal(capture.scope)}, ${literal(capture.finishedAt)}, ${capture.documentCount}, ${literal(canonicalJson(capture))}, ${literal(documentsJson)})
    ON CONFLICT(data_sha256) DO NOTHING`;
  const salnCount = decoded.documents.reduce((total, document) => {
    const records: unknown = document.data && typeof document.data === "object" ? Reflect.get(document.data, "saln_records") : undefined;
    if (!Array.isArray(records)) throw new Error("Expected a SALN array in each application record");
    return total + records.length;
  }, 0);
  return { dataSha256: capture.dataSha256 as string, documentCount: documents.length, salnCount, documentsJson,
    statements: [...legacyCopySchema, insert],
    verificationSql: `SELECT data_sha256, project_id, scope, document_count,
      documents_json = ${literal(documentsJson)} AS source_data_matches,
      capture_json = ${literal(canonicalJson(capture))} AS capture_metadata_matches,
      json_extract(capture_json, '$.dataSha256') = data_sha256
        AND json_extract(capture_json, '$.projectId') = project_id
        AND json_extract(capture_json, '$.scope') = scope
        AND json_extract(capture_json, '$.documentCount') = document_count
        AND json_extract(capture_json, '$.finishedAt') = captured_at AS capture_identity_matches,
      (SELECT count(*) FROM legacy_officials WHERE capture_sha256 = c.data_sha256) AS officials,
      (SELECT count(*) FROM legacy_saln_records WHERE capture_sha256 = c.data_sha256) AS saln_records
      FROM legacy_firestore_captures c WHERE data_sha256 = ${literal(capture.dataSha256)}`,
  };
}

async function main() {
  const [directory, output, ...extra] = process.argv.slice(2);
  if (!directory || !output || extra.length) throw new Error("Usage: archive:prepare-legacy-copy -- capture-directory private-output-directory");
  const copy = await prepareLegacyCopy(directory);
  await mkdir(output, { recursive: true, mode: 0o700 });
  await writeFile(join(output, "copy.sql"), ["BEGIN IMMEDIATE", ...copy.statements, "COMMIT", copy.verificationSql].join(";\n\n") + ";\n", { flag: "wx", mode: 0o600 });
  for (const [index, statement] of copy.statements.entries()) await writeFile(join(output, `${index + 1}.sql`), statement + ";\n", { flag: "wx", mode: 0o600 });
  await writeFile(join(output, "verify.sql"), copy.verificationSql + ";\n", { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ output, dataSha256: copy.dataSha256, officials: copy.documentCount, salnRecords: copy.salnCount, scope: "public_reader", remoteWritesPerformed: false }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => {
  console.error("Legacy copy preparation failed. Check capture integrity and use a new private output directory.");
  process.exitCode = 1;
});
