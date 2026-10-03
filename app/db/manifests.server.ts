import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { documentStorageKey, type DocumentStorage } from "../storage/objects.server";
import type { ArchiveDatabase } from "./client.server";
import { canonicalJson } from "./canonical";
import { validateReviewedFiling, type ReviewedFiling } from "./filing-validation";
import { inspectReviewedFiling, requireEligiblePerson, verifiedDocumentBytes, writeReviewedFiling } from "./filings.server";
import { writeReviewedPerson } from "./people.server";
import { manifestApplications } from "./schema";
import { choice, object, text, validateReviewedPerson, type ReviewedPerson } from "./validation";
import { validateReviewedCorrection, type ReviewedCorrection } from "./correction-validation";
import { writeReviewedCorrection } from "./corrections.server";
import { legacyPersonRecord, validateReviewedIdentities, type ReviewedIdentities } from "./identity-validation";
import { writeReviewedIdentities } from "./identities.server";
import { validateReviewedRoster, writeReviewedRoster, type ReviewedRoster } from "./rosters.server";

export type ReviewedManifest = { id: string; version: 1 } & (
  { kind: "person"; payload: ReviewedPerson } | { kind: "filing"; payload: ReviewedFiling } | { kind: "correction"; payload: ReviewedCorrection } | { kind: "identities"; payload: ReviewedIdentities } | { kind: "roster"; payload: ReviewedRoster }
);

export function validateReviewedManifest(value: unknown): ReviewedManifest {
  const input = object(value, ["id", "version", "kind", "payload"], "manifest");
  const id = text(input.id, "manifest.id");
  if (input.version !== 1) throw new Error("Unsupported manifest version");
  const kind = choice(input.kind, ["person", "filing", "correction", "identities", "roster"], "manifest.kind");
  if (kind === "person") return { id, version: 1, kind, payload: validateReviewedPerson(input.payload) };
  if (kind === "filing") return { id, version: 1, kind, payload: validateReviewedFiling(input.payload) };
  if (kind === "identities") return { id, version: 1, kind, payload: validateReviewedIdentities(input.payload) };
  if (kind === "roster") return { id, version: 1, kind, payload: validateReviewedRoster(input.payload) };
  return { id, version: 1, kind, payload: validateReviewedCorrection(input.payload) };
}

export function manifestDigest(manifest: ReviewedManifest): string {
  return createHash("sha256").update(canonicalJson(manifest)).digest("hex");
}

export async function applyReviewedManifest(db: ArchiveDatabase, input: unknown, options: { bytes?: Uint8Array; storage?: DocumentStorage } = {}) {
  const manifest = validateReviewedManifest(input);
  const canonicalPayload = canonicalJson(manifest);
  const digest = manifestDigest(manifest);
  const [previous] = await db.select().from(manifestApplications).where(eq(manifestApplications.id, manifest.id));
  function checkApplication(application: typeof manifestApplications.$inferSelect) {
    if (application.digest !== digest || application.canonicalPayload !== canonicalPayload || application.version !== manifest.version || application.kind !== manifest.kind) {
      throw new Error("Manifest ID already has different content; publish an Editorial Correction with a new ID");
    }
  }
  if (previous) checkApplication(previous);
  if (manifest.kind === "filing") {
    if (!options.bytes || !options.storage) throw new Error("A Filing manifest requires Source Document bytes and storage");
    const body = verifiedDocumentBytes(manifest.payload.document, options.bytes);
    await inspectReviewedFiling(db, manifest.payload, Boolean(previous));
    if (!previous) await requireEligiblePerson(db, manifest.payload.filing.personId);
    const existing = await options.storage.get(manifest.payload.document.sha256);
    if (existing) verifiedDocumentBytes(manifest.payload.document, existing);
    else {
      if (previous) throw new Error("Source Document bytes are missing from an applied manifest");
      const stored = await options.storage.put(body, manifest.payload.document.sha256, manifest.payload.document.mediaType);
      if (stored.storageKey !== documentStorageKey(manifest.payload.document.sha256)) throw new Error("Storage returned an unexpected Source Document key");
    }
  }
  return db.transaction(async tx => {
    const [existing] = await tx.select().from(manifestApplications).where(eq(manifestApplications.id, manifest.id));
    if (existing) checkApplication(existing);
    if (!existing) await tx.insert(manifestApplications).values({ id: manifest.id, version: manifest.version, kind: manifest.kind, digest, canonicalPayload, appliedAt: new Date().toISOString() });
    if (manifest.kind === "person") await writeReviewedPerson(tx, manifest.payload, Boolean(existing));
    else if (manifest.kind === "filing") await writeReviewedFiling(tx, manifest.payload, Boolean(existing));
    else if (manifest.kind === "correction") await writeReviewedCorrection(tx, manifest.id, manifest.payload, Boolean(existing));
    else if (manifest.kind === "roster") await writeReviewedRoster(tx, manifest.id, manifest.payload, Boolean(existing));
    else {
      for (const entry of manifest.payload.legacyPeople) await writeReviewedPerson(tx, legacyPersonRecord(manifest.payload.review, entry), Boolean(existing));
      await writeReviewedIdentities(tx, manifest.id, manifest.payload, Boolean(existing));
    }
    return { manifestId: manifest.id, digest, status: existing ? "unchanged" as const : "applied" as const };
  });
}
