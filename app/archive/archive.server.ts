import { createLocalArchive } from "./local";
import { createLegacyArchive } from "./legacy";
import type { Archive } from "./types";

const localArchive = createLocalArchive();
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
  if (process.env.ARCHIVE_ADAPTER === "local") return localArchive;
  return legacyArchive();
}

export async function readLegacyHome() {
  return (await legacyArchive()).readHome();
}

export async function readLegacyProfile(slug: string) {
  return (await legacyArchive()).readProfile(slug);
}
