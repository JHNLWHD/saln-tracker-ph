import { createClient, LibsqlError, type Config } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { setTimeout as delay } from "node:timers/promises";

export function connectArchive(config: Config) {
  const client = createClient(config);
  return { client, db: drizzle(client) };
}

export type ArchiveDatabase = ReturnType<typeof connectArchive>["db"];
export type ArchiveReader = Pick<ArchiveDatabase, "select">;
/** Both the database and a Drizzle transaction expose these typed statements. */
export type ArchiveWriter = Pick<ArchiveDatabase, "select" | "insert">;

/** Retry write contention after rollback, keeping manifest replay in the transaction. */
export async function writeArchiveTransaction<T>(db: ArchiveDatabase, write: (tx: ArchiveWriter) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction(write);
    } catch (error) {
      const cause = error instanceof LibsqlError ? error : error instanceof Error ? error.cause : undefined;
      if (!(cause instanceof LibsqlError) || cause.code !== "SQLITE_BUSY") throw error;
      // Reopen the idle local connection to clear its failed BEGIN statement.
      // Active transactions own separate connections.
      if (db.$client.protocol === "file") await db.$client.reconnect();
      if (attempt === 4) throw error;
      await delay(25 * 2 ** attempt);
    }
  }
}

/** Drizzle's libSQL driver ignores transaction config and otherwise requests native write mode. */
export function readArchiveTransaction<T>(db: ArchiveDatabase, read: (tx: ArchiveReader) => Promise<T>): Promise<T> {
  const client = new Proxy(db.$client, {
    get(target, key) {
      if (key === "transaction") return () => target.transaction("read");
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return drizzle(client).transaction(read);
}
