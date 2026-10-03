import { createClient, type Config } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

export function connectArchive(config: Config) {
  const client = createClient(config);
  return { client, db: drizzle(client) };
}

export type ArchiveDatabase = ReturnType<typeof connectArchive>["db"];
