import fs from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { connectArchive } from "../app/db/client.server";
import { exportPublicSnapshot } from "../app/archive/snapshot.server";

export async function writeSnapshotArtifacts(output: string, artifacts: Awaited<ReturnType<typeof exportPublicSnapshot>>) {
  const directory = resolve(output, artifacts.snapshot.version);
  const files = [["archive.json", artifacts.snapshotJson], ["source-checksums.json", artifacts.checksumManifestJson]];
  async function verifyExisting() {
    try { await fs.lstat(directory); }
    catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
      throw error;
    }
    for (const [name, contents] of files) {
      const path = join(directory, name);
      if (await fs.readFile(path, "utf8") !== contents) throw new Error(`Existing snapshot file has different content: ${path}`);
    }
    return true;
  }
  if (await verifyExisting()) return directory;
  await fs.mkdir(resolve(output), { recursive: true });
  const staging = await fs.mkdtemp(join(resolve(output), ".snapshot-"));
  try {
    for (const [name, contents] of files) await fs.writeFile(join(staging, name), contents, { flag: "wx" });
    try { await fs.rename(staging, directory); }
    catch (error) {
      if (!(error instanceof Error && "code" in error && (error.code === "EEXIST" || error.code === "ENOTEMPTY"))) throw error;
      if (!await verifyExisting()) throw error;
    }
    return directory;
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}

async function main() {
  const [output, ...extra] = process.argv.slice(2);
  if (!output || extra.length) throw new Error("Usage: archive:export -- output-directory");
  const { client, db } = connectArchive({ url: process.env.TURSO_DATABASE_URL || "file:.data/archive.db", authToken: process.env.TURSO_AUTH_TOKEN });
  try {
    const artifacts = await exportPublicSnapshot(db);
    const directory = await writeSnapshotArtifacts(output, artifacts);
    console.log(JSON.stringify({ version: artifacts.snapshot.version, directory }));
  } finally {
    client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
