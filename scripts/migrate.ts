import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { migrate } from "drizzle-orm/libsql/migrator";
import type { Client } from "@libsql/client";
import { connectArchive, type ArchiveDatabase } from "../app/db/client.server";
import { writeDatabaseConfig } from "../app/db/cli";

export async function migrateArchive(db: ArchiveDatabase) {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
}

export async function rollbackArchive(client: Client) {
  const sql = await readFile(new URL("../drizzle/0000_down.sql", import.meta.url), "utf8");
  await client.batch(sql.split(";").map(statement => statement.trim()).filter(Boolean), "write");
}

async function main() {
  const args = process.argv.slice(2);
  const config = writeDatabaseConfig(args);
  if (args.includes("--down") && !config.url.startsWith("file:")) throw new Error("Rollback is limited to local databases");
  if (config.url === "file:.data/archive.db") await mkdir(".data", { recursive: true });
  const { client, db } = connectArchive(config);
  try {
    if (args.includes("--down")) await rollbackArchive(client);
    else await migrateArchive(db);
    console.log(args.includes("--down") ? "Local schema removed." : "Schema migrations applied.");
  } finally {
    client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
