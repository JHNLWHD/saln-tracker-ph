import { readFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { connectArchive } from "../app/db/client.server";
import { writeDatabaseConfig } from "../app/db/cli";
import { importReviewedPerson } from "../app/db/people.server";

async function main() {
  const file = process.argv[2];
  if (!file || file.startsWith("--")) throw new Error("Usage: import-person.ts reviewed-person.json [--environment local|staging]");
  const config = writeDatabaseConfig(process.argv.slice(3));
  const input: unknown = JSON.parse(await readFile(file, "utf8"));
  if (config.url === "file:.data/archive.db") await mkdir(".data", { recursive: true });
  const { client, db } = connectArchive(config);
  try {
    console.log(JSON.stringify(await importReviewedPerson(db, input)));
  } finally {
    client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
