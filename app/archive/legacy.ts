import { getOfficialWithSALNData } from "../data/officials";
import type { Official, SALNRecord } from "../data/officials";
import type { Archive, PersonRecord } from "./types";

export interface LegacyDocument {
  id: string;
  data: unknown;
}

export interface LegacyReader {
  list(): Promise<LegacyDocument[]>;
  find(slug: string): Promise<LegacyDocument | null>;
}

export interface LegacyPersonPresentation {
  official: Official;
  officialWithSALN: ReturnType<typeof getOfficialWithSALNData>;
  salnRecords: SALNRecord[];
}

function parseLegacyDocument(document: LegacyDocument): Official | null {
  if (!document.data || typeof document.data !== "object") return null;
  const data = document.data as Record<string, unknown>;
  if (typeof data.name !== "string" || !data.name.trim() ||
      !["EXECUTIVE", "LEGISLATIVE", "CONSTITUTIONAL_COMMISSION", "JUDICIARY"].includes(String(data.agency)) ||
      !["active", "inactive"].includes(String(data.status))) return null;

  const records = Array.isArray(data.saln_records) ? data.saln_records : [];
  return {
    slug: typeof data.slug === "string" && data.slug ? data.slug : document.id,
    name: data.name,
    position: typeof data.position === "string" ? data.position : "",
    agency: data.agency as Official["agency"],
    status: data.status as Official["status"],
    term_start: typeof data.term_start === "string" ? data.term_start : undefined,
    term_end: typeof data.term_end === "string" ? data.term_end : undefined,
    saln_records: records.filter((record) => record &&
      typeof record === "object" && Number.isInteger(record.year) &&
      [record.net_worth, record.total_assets, record.total_liabilities].every(Number.isFinite) &&
      (record.assets == null || Array.isArray(record.assets)) &&
      (record.liabilities == null || Array.isArray(record.liabilities)))
      .map((record): SALNRecord => ({ ...record, assets: record.assets ?? [], liabilities: record.liabilities ?? [] })),
  };
}

function projectLegacyDocument(document: LegacyDocument) {
  const official = parseLegacyDocument(document);
  if (!official) return null;
  const person: PersonRecord = {
    person: {
      id: document.id,
      slug: official.slug,
      canonicalName: official.name,
      nameVariants: [],
      legacySlugs: document.id === official.slug ? [] : [document.id],
      eligibility: "unverified",
    },
    // Old positions, status labels, links, and amounts need source review.
    offices: [], tenures: [], constituencies: [], jurisdictions: [], electoralTerms: [],
    filings: [], sourceDocuments: [], financialSummaries: [],
  };
  const legacyPresentation: LegacyPersonPresentation = {
    official,
    officialWithSALN: getOfficialWithSALNData(official),
    salnRecords: [...(official.saln_records || [])].sort((a, b) => b.year - a.year),
  };
  return { person, legacyPresentation };
}

/** This sidecar preserves the old UI while canonical readers stay evidence-only. */
export function createLegacyArchive(reader: LegacyReader) {
  async function readHome() {
    const entries = (await reader.list()).flatMap(document => {
      const entry = projectLegacyDocument(document);
      return entry ? [entry] : [];
    });
    return {
      people: entries.map(entry => entry.person),
      legacyPresentation: entries.map(entry => entry.legacyPresentation.officialWithSALN),
    };
  }
  async function readProfile(slug: string) {
    const document = await reader.find(slug);
    return document ? projectLegacyDocument(document) : null;
  }
  const archive: Archive = {
    async listPeople() {
      // Unreviewed legacy identities cannot enter a public archive directory.
      return [];
    },
    async findPersonBySlug(slug) {
      return (await readProfile(slug))?.person ?? null;
    },
    async findSourceDocument() { return null; },
  };
  return { ...archive, readHome, readProfile };
}
