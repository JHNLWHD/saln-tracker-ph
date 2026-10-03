import { createLocalArchive } from "./local";
import { createLegacyArchive } from "./legacy";
import type { Archive } from "./types";

const localArchive = createLocalArchive();
let databaseArchive: Promise<Archive> | undefined;
let closeDatabase: (() => void) | undefined;
const localLegacyArchive = createLegacyArchive({
  async list() { return []; },
  async find() { return null; },
});

async function legacyArchive() {
  if (process.env.ARCHIVE_ADAPTER === "local") return localLegacyArchive;
  if (process.env.ARCHIVE_ADAPTER && process.env.ARCHIVE_ADAPTER !== "firebase") {
    throw new Error(`Unknown Archive adapter: ${process.env.ARCHIVE_ADAPTER}`);
  }
  return (await import("./firebase.server")).firebaseArchive;
}

export async function getArchive(): Promise<Archive> {
  if (process.env.ARCHIVE_ENVIRONMENT === 'staging' && process.env.ARCHIVE_ADAPTER !== 'turso') throw new Error('Staging requires the Turso Archive adapter');
  const adapter = process.env.ARCHIVE_ADAPTER ?? "turso";
  if (adapter === "local") return localArchive;
  if (adapter === "turso") {
    if (!process.env.TURSO_DATABASE_URL) throw new Error("TURSO_DATABASE_URL is required for the Turso Archive adapter");
    if (!databaseArchive) {
      const url = process.env.TURSO_DATABASE_URL;
      databaseArchive = (async () => {
        const [{ connectArchive }, { createDbArchive }] = await Promise.all([
          import("../db/client.server"), import("../db/people.server"),
        ]);
        const { client, db } = connectArchive({ url, authToken: process.env.TURSO_AUTH_TOKEN });
        closeDatabase = () => client.close();
        return createDbArchive(db);
      })();
    }
    return databaseArchive;
  }
  throw new Error(`Unknown Archive adapter: ${adapter}`);
}

/** Release the server connection when a local process or route test shuts down. */
export async function closeArchive() {
  await databaseArchive?.catch(() => undefined);
  closeDatabase?.();
  closeDatabase = undefined;
  databaseArchive = undefined;
}

export async function readLegacyHome() {
  return (await legacyArchive()).readLegacyHome();
}

export async function readLegacyProfile(slug: string) {
  return (await legacyArchive()).readProfile(slug);
}
