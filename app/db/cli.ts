import type { Config } from "@libsql/client";

/** CLI writes require a named remote target. Production publication is a later release gate. */
export function writeDatabaseConfig(args: string[], env: NodeJS.ProcessEnv = process.env): Config {
  const url = env.TURSO_DATABASE_URL || "file:.data/archive.db";
  let environment: string | undefined;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--down") continue;
    if (args[index] !== "--environment" || environment) throw new Error("Unsupported or repeated database option");
    environment = args[++index];
    if (!["local", "staging", "production"].includes(environment)) throw new Error("Database environment must be local, staging, or production");
  }
  if (url.startsWith("file:")) {
    if (args.includes("--environment") && environment !== "local") throw new Error("A local database requires --environment local");
    return { url };
  }
  if (!args.includes("--environment") || environment !== "staging" || env.ARCHIVE_ENVIRONMENT !== "staging") {
    throw new Error("Remote writes require --environment staging and ARCHIVE_ENVIRONMENT=staging. Production publication requires the release approval workflow.");
  }
  if (!env.TURSO_AUTH_TOKEN) throw new Error("TURSO_AUTH_TOKEN is required for the staging database");
  const parsed = new URL(url);
  if (!["libsql:", "https:"].includes(parsed.protocol)) throw new Error("Remote database URL must use libsql or HTTPS");
  return { url, authToken: env.TURSO_AUTH_TOKEN };
}
