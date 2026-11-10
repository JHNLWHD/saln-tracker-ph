import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { connectArchive } from "../app/db/client.server";
import { writeDatabaseConfig } from "../app/db/cli";
import { validateReviewedPerson } from "../app/db/validation";
import { validateReviewedFiling } from "../app/db/filing-validation";
import { applyReviewedManifest, validateReviewedManifest } from "../app/db/manifests.server";
import { createDocumentStorage } from "../app/storage/objects.server";

/** The compatibility commands and the versioned CLI share the same application ledger. */
export async function runManifestImport(legacyKind?: "person" | "filing") {
  const args = process.argv.slice(2);
  const manifestPath = args.shift();
  if (!manifestPath || manifestPath.startsWith("--")) throw new Error("Usage: archive:import -- manifest.json [source-file] [--environment local|staging]");
  const documentPath = args[0] && !args[0].startsWith("--") ? args.shift() : undefined;
  const config = writeDatabaseConfig(args);
  let input: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
  if (legacyKind === "person") {
    const payload = validateReviewedPerson(input);
    input = { id: `person:${payload.person.id}`, version: 1, kind: "person", payload };
  } else if (legacyKind === "filing") {
    const payload = validateReviewedFiling(input);
    input = { id: `filing:${payload.document.id}`, version: 1, kind: "filing", payload };
  }
  const manifest = validateReviewedManifest(input);
  if (manifest.kind === "filing" && !documentPath) throw new Error("A Filing manifest requires its acquired source file");
  if (manifest.kind !== "filing" && documentPath) throw new Error("Only a Filing manifest accepts a source file");
  if (manifest.kind === "filing") {
    const expected = config.url.startsWith("file:") ? "local" : "r2";
    if (process.env.ARCHIVE_STORAGE !== expected) throw new Error(`This database target requires ARCHIVE_STORAGE=${expected}`);
  }
  const options = manifest.kind === "filing" ? { bytes: await readFile(documentPath!), storage: createDocumentStorage() } : {};
  const { client, db } = connectArchive(config);
  try {
    console.log(JSON.stringify(await applyReviewedManifest(db, manifest, options)));
  } finally {
    client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runManifestImport().catch(error => { console.error(error.message); process.exitCode = 1; });
}
