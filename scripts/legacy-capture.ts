import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { SDK_VERSION } from "firebase/app";
import { Bytes, DocumentReference, GeoPoint, Timestamp, collection, getDocsFromServer, querySnapshotFromJSON, terminate } from "firebase/firestore";
import { v1 } from "firebase-admin/firestore";
import { SDK_VERSION as ADMIN_SDK_VERSION } from "firebase-admin/app";
import { canonicalJson } from "../app/db/canonical";
import { choice } from "../app/db/validation";

const projectId = "saln-tracker-ph";
const databaseRoot = `projects/${projectId}/databases/(default)/documents`;
export const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

/** Preserve SDK values without losing date precision, bytes, references or non-finite numbers. */
export function typedFirestoreValue(value: unknown): unknown {
  if (value === null) return { type: "null" };
  if (value instanceof Timestamp) return { type: "timestamp", seconds: value.seconds, nanoseconds: value.nanoseconds };
  if (value instanceof GeoPoint) return { type: "geopoint", latitude: value.latitude, longitude: value.longitude };
  if (value instanceof Bytes) return { type: "bytes", base64: value.toBase64() };
  if (value instanceof DocumentReference) return { type: "reference", path: value.path, projectId: value.firestore.app.options.projectId };
  if (Array.isArray(value)) return { type: "array", values: value.map(typedFirestoreValue) };
  if (typeof value === "number") return { type: "number", value: Number.isNaN(value) ? "NaN" : value === Infinity ? "Infinity" : value === -Infinity ? "-Infinity" : Object.is(value, -0) ? "-0" : value };
  if (typeof value === "string" || typeof value === "boolean") return { type: typeof value, value };
  if (value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    return { type: "map", fields: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, typedFirestoreValue(child)])) };
  }
  throw new Error("Unsupported Firestore value; no lossy capture is accepted");
}

/** This function receives only read APIs. SDK iterators consume every page. */
export async function exportDatabaseDocuments(reader: Pick<InstanceType<typeof v1.FirestoreClient>, "listCollectionIdsAsync" | "listDocumentsAsync">, readTime: string) {
  const time = Date.parse(readTime);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== readTime) throw new Error("Export readTime must be a UTC ISO timestamp");
  const timestamp = { seconds: Math.floor(time / 1000), nanos: time % 1000 * 1_000_000 };
  // ponytail: the small legacy database fits in memory; stream indexed artifacts if it grows beyond process memory.
  const documents: { name: string; [key: string]: unknown }[] = [], collections: string[] = [];
  const seen = new Set<string>();
  async function visit(parent: string) {
    for await (const collectionId of reader.listCollectionIdsAsync({ parent, readTime: timestamp })) {
      if (!collectionId || collectionId.includes("/")) throw new Error("Invalid collection ID in export");
      const collectionPath = `${parent}/${collectionId}`;
      if (seen.has(collectionPath)) throw new Error("Duplicate collection path in export");
      seen.add(collectionPath);
      collections.push(collectionPath);
      for await (const document of reader.listDocumentsAsync({ parent, collectionId, readTime: timestamp, showMissing: true })) {
        const name = document.name;
        if (!name || !name.startsWith(`${collectionPath}/`) || name.slice(collectionPath.length + 1).includes("/") || seen.has(name)) throw new Error("Invalid or duplicate document path in export");
        seen.add(name);
        // Proto JSON keeps int64 strings. Convert bytes and special doubles explicitly.
        const preserved = JSON.parse(JSON.stringify(document, (key, value) => {
          if (key === "bytesValue" && value instanceof Uint8Array) return Buffer.from(value).toString("base64");
          if (key === "bytesValue" && value?.type === "Buffer" && Array.isArray(value.data)) return Buffer.from(value.data).toString("base64");
          if (key === "doubleValue" && typeof value === "number" && !Number.isFinite(value)) return String(value);
          if (key === "doubleValue" && Object.is(value, -0)) return "-0";
          return value;
        }));
        documents.push(preserved);
        // Missing parents still have subcollections. showMissing makes them reachable.
        await visit(name);
      }
    }
  }
  await visit(databaseRoot);
  documents.sort((a, b) => a.name.localeCompare(b.name));
  return { format: "firestore-document-tree/v1", databaseRoot, readTime, collections: collections.sort(), documents };
}

export async function captureLegacy(scope: "database_document_tree" | "public_reader") {
  const startedAt = new Date().toISOString();
  const directory = join(".data", "legacy-audit", startedAt.replaceAll(":", "-"));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const rawFiles: { file: string; sha256: string; byteSize: number; format: string }[] = [];
  async function preserve(file: string, format: string, value: unknown) {
    const body = JSON.stringify(value, null, 2) + "\n";
    await writeFile(join(directory, file), body, { flag: "wx", mode: 0o600 });
    rawFiles.push({ file, format, sha256: sha256(body), byteSize: Buffer.byteLength(body) });
  }
  let dataSha256: string, documentCount: number, readTime: string | null = null;
  if (scope === "database_document_tree") {
    const client = new v1.FirestoreClient({ projectId });
    try {
      // One fixed read time for all collections, pages and missing-parent descendants.
      readTime = new Date(Date.now() - 5000).toISOString();
      const result = await exportDatabaseDocuments(client, readTime);
      documentCount = result.documents.length;
      dataSha256 = sha256(canonicalJson(result));
      await preserve("database-documents.json", result.format, result);
    } finally { await client.close(); }
  } else {
    const { db } = await import("../app/lib/firebase");
    const reads: string[] = [];
    try {
      for (const index of [1, 2]) {
        const snapshot = await getDocsFromServer(collection(db, "officials"));
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites || snapshot.docs.length !== snapshot.size) throw new Error("Expected a complete server query without pending writes");
        const raw = snapshot.toJSON();
        const normalize = (value: typeof snapshot) => value.docs.map(document => ({ id: document.id, path: document.ref.path, data: typedFirestoreValue(document.data()) })).sort((a, b) => a.id.localeCompare(b.id));
        const docs = normalize(snapshot);
        const digest = sha256(canonicalJson(docs));
        if (sha256(canonicalJson(normalize(querySnapshotFromJSON(db, raw)))) !== digest) throw new Error("SDK snapshot failed its data round trip");
        reads.push(digest);
        await preserve(`officials-read-${index}.sdk.json`, "firebase-query-snapshot/v1", raw);
        await preserve(`officials-read-${index}.typed.json`, "typed-firestore-documents/v1", { documents: docs });
        documentCount = snapshot.size;
      }
      if (reads[0] !== reads[1]) throw new Error("Legacy collection changed between server reads; capture is incomplete");
      dataSha256 = reads[0];
    } finally { await terminate(db); }
  }
  const capture = { format: "legacy-capture/v1", classification: "Non-canonical audit artifact", projectId, database: "(default)", scope,
    completeDatabaseDocumentTree: scope === "database_document_tree", startedAt, finishedAt: new Date().toISOString(), readTime,
    sdkVersion: scope === "public_reader" ? SDK_VERSION : ADMIN_SDK_VERSION, documentCount: documentCount!, dataSha256, rawFiles, writesPerformed: false };
  await preserve("capture.json", capture.format, capture);
  return { directory, scope, documentCount: documentCount!, dataSha256, completeDatabaseDocumentTree: capture.completeDatabaseDocumentTree };
}

export async function readCapture(directory: string) {
  const capture = JSON.parse(await readFile(join(directory, "capture.json"), "utf8"));
  if (capture.format !== "legacy-capture/v1" || capture.projectId !== projectId || capture.database !== "(default)" || capture.writesPerformed !== false ||
      !["database_document_tree", "public_reader"].includes(capture.scope) || !Array.isArray(capture.rawFiles) || !capture.rawFiles.length) throw new Error("Unsupported legacy capture");
  const validDate = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
  if (!validDate(capture.startedAt) || !validDate(capture.finishedAt) || !Number.isInteger(capture.documentCount) || capture.documentCount < 0 || !/^[a-f0-9]{64}$/.test(capture.dataSha256) ||
      capture.completeDatabaseDocumentTree !== (capture.scope === "database_document_tree") || (capture.scope === "database_document_tree" ? !validDate(capture.readTime) : capture.readTime !== null)) throw new Error("Invalid capture provenance");
  const expectedFiles = capture.scope === "database_document_tree" ? ["database-documents.json"] : ["officials-read-1.sdk.json", "officials-read-1.typed.json", "officials-read-2.sdk.json", "officials-read-2.typed.json"];
  if (capture.rawFiles.length !== expectedFiles.length || new Set(capture.rawFiles.map((row: { file: string }) => row.file)).size !== expectedFiles.length || capture.rawFiles.some((row: { file: string }) => !expectedFiles.includes(row.file))) throw new Error("Capture is incomplete");
  const files = new Map<string, unknown>();
  for (const row of capture.rawFiles) {
    if (typeof row.file !== "string" || !/^[a-z0-9.-]+\.json$/.test(row.file) || row.file === "capture.json") throw new Error("Unsafe raw capture filename");
    const body = await readFile(join(directory, row.file));
    if (body.length !== row.byteSize || sha256(body) !== row.sha256) throw new Error("Raw capture integrity check failed");
    files.set(row.file, JSON.parse(body.toString("utf8")));
  }
  return { capture, files };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scope = choice(process.argv[2] ?? "database_document_tree", ["database_document_tree", "public_reader"], "capture scope");
  if (process.argv.length > 3) throw new Error("Usage: archive:capture-legacy -- [database_document_tree|public_reader]");
  captureLegacy(scope).then(result => console.log(JSON.stringify(result))).catch(() => {
    console.error("Legacy capture failed. No complete capture was published. Database-wide export requires ADC with Firestore read access; public_reader explicitly captures only the legacy collection.");
    process.exitCode = 1;
  });
}
