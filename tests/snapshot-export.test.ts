import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { exportPublicSnapshot } from "../app/archive/snapshot.server";
import { connectArchive } from "../app/db/client.server";
import { writeSnapshotArtifacts } from "../scripts/export-snapshot";
import { migrateArchive } from "../scripts/migrate";

test("snapshot publication verifies complete existing pairs and cleans up a failed staging write", async t => {
  const output = await fs.mkdtemp(join(tmpdir(), "saln-export-test-"));
  const { client, db } = connectArchive({ url: ":memory:" });
  try {
    await migrateArchive(db);
    const artifacts = await exportPublicSnapshot(db);
    const directory = join(output, artifacts.snapshot.version);
    const writeFile = fs.writeFile;
    let writes = 0;
    const failure = t.mock.method(fs, "writeFile", async (...args: Parameters<typeof fs.writeFile>) => {
      if (++writes === 2) {
        await writeFile(args[0], "partial staged file", args[2]);
        throw new Error("Simulated staging write failure");
      }
      return writeFile(...args);
    });
    await assert.rejects(writeSnapshotArtifacts(output, artifacts), /Simulated staging write failure/);
    failure.mock.restore();
    assert.deepEqual(await fs.readdir(output), []);

    assert.equal(await writeSnapshotArtifacts(output, artifacts), directory);
    assert.equal(await fs.readFile(join(directory, "archive.json"), "utf8"), artifacts.snapshotJson);
    assert.equal(await fs.readFile(join(directory, "source-checksums.json"), "utf8"), artifacts.checksumManifestJson);
    assert.equal(await writeSnapshotArtifacts(output, artifacts), directory);
    assert.deepEqual(await fs.readdir(output), [artifacts.snapshot.version]);

    await fs.writeFile(join(directory, "source-checksums.json"), "conflicting content");
    await assert.rejects(writeSnapshotArtifacts(output, artifacts), /different content/);
    assert.equal(await fs.readFile(join(directory, "source-checksums.json"), "utf8"), "conflicting content");
    await fs.rm(join(directory, "source-checksums.json"));
    await assert.rejects(writeSnapshotArtifacts(output, artifacts), { code: "ENOENT" });
    assert.deepEqual(await fs.readdir(directory), ["archive.json"]);
    assert.deepEqual(await fs.readdir(output), [artifacts.snapshot.version]);
  } finally {
    t.mock.restoreAll();
    client.close();
    await fs.rm(output, { recursive: true, force: true });
  }
});
