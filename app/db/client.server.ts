import { createClient, type Config } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

export function connectArchive(config: Config) {
  const client = createClient(config);
  return { client, db: drizzle(client) };
}

export type ArchiveDatabase = ReturnType<typeof connectArchive>["db"];
export type ArchiveReader = Pick<ArchiveDatabase, "select">;
/** Both the database and a Drizzle transaction expose these typed statements. */
export type ArchiveWriter = Pick<ArchiveDatabase, "select" | "insert">;

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
