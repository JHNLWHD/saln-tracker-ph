import type { Archive, ArchiveHome, PersonRecord } from "./types";
import { directoryFromRecords } from './directory';

/** In-memory snapshots make route and domain checks independent of remote services. */
export function createLocalArchive(records: PersonRecord[] = [], home: ArchiveHome = { rosters: [], recentlyAdded: [] }): Archive {
  const snapshot = structuredClone(records);
  return {
    async browsePeople(filters) { return directoryFromRecords(snapshot, filters); },
    async readHome() { return structuredClone(home); },
    async listPeople() {
      return structuredClone(snapshot.filter(record => record.person.eligibility === "eligible"));
    },
    async findPersonBySlug(slug) {
      return structuredClone(snapshot.find(record => record.person.id === slug || record.person.slug === slug ||
        record.person.legacySlugs.includes(slug)) ?? null);
    },
    async findSourceDocument(sha256) {
      return structuredClone(snapshot.filter(record => record.person.eligibility === "eligible")
        .flatMap(record => record.sourceDocuments).find(document => document.sha256 === sha256) ?? null);
    },
    async findLegacyDocument() { return null; },
  };
}
