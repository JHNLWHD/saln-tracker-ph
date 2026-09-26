import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { connectArchive } from "../app/db/client.server";
import { writeDatabaseConfig } from "../app/db/cli";
import { importReviewedFiling } from "../app/db/filings.server";
import { createDocumentStorage } from "../app/storage/objects.server";

async function main() {
  const [manifestPath, documentPath, ...args] = process.argv.slice(2);
  if (!manifestPath || !documentPath || manifestPath.startsWith("--") || documentPath.startsWith("--")) {
    throw new Error("Usage: import-filing.ts reviewed-filing.json source-file [--environment local|staging]");
  }
  const config = writeDatabaseConfig(args);
  if (config.url.startsWith("file:") && process.env.ARCHIVE_STORAGE !== "local") {
    throw new Error("A local database requires local Source Document storage");
  }
  if (!config.url.startsWith("file:") && process.env.ARCHIVE_STORAGE !== "r2") {
    throw new Error("A staging database requires R2 Source Document storage");
  }
  const input: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
  const bytes = await readFile(documentPath);
  const storage = createDocumentStorage();
  const { client, db } = connectArchive(config);
  try {
    console.log(JSON.stringify(await importReviewedFiling(db, input, bytes, storage)));
  } finally {
    client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
