import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { readArchiveTransaction, type ArchiveDatabase } from "../db/client.server";
import { projectCorrections, readEditorialCorrections } from "../db/corrections.server";
import { personIsEligible } from "../db/eligibility";
import * as schema from "../db/schema";
import { parsePartialDate } from "../db/validation";
import type { CorrectionChanges } from "./types";

function orderedChanges(changes: CorrectionChanges) {
  return Object.fromEntries(Object.entries(changes).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([field, value]) => [field, Array.isArray(value) ? [...value].sort() : value]));
}

/** Read only named public fields. New private tables or columns are never exported implicitly. */
export async function exportPublicSnapshot(db: ArchiveDatabase) {
  const data = await readArchiveTransaction(db, async tx => {
    const corrections = await readEditorialCorrections(tx);
    const personRows = await tx.select({ id: schema.people.id, slug: schema.people.slug, canonicalName: schema.people.canonicalName })
      .from(schema.people).where(personIsEligible()).orderBy(schema.people.id);
    const personIds = personRows.map(person => person.id);
    const names = await tx.select({ personId: schema.personNames.personId, value: schema.personNames.value })
      .from(schema.personNames).where(inArray(schema.personNames.personId, personIds)).orderBy(schema.personNames.personId, schema.personNames.value);
    const projectedPeople = personRows.map(person => projectCorrections("person", { ...person, nameVariants: names.filter(name => name.personId === person.id).map(name => name.value) }, corrections));
    const people = projectedPeople.map(({ nameVariants, ...person }) => person);
    const personNames = projectedPeople.flatMap(person => [...person.nameVariants].sort().map(value => ({ personId: person.id, value })));
    const tenureRows = (await tx.select({
      id: schema.tenures.id, personId: schema.tenures.personId, officeId: schema.tenures.officeId,
      electoralTermId: schema.tenures.electoralTermId, constituencyId: schema.tenures.constituencyId,
      startDate: schema.tenures.startDate, endDate: schema.tenures.endDate, assumptionMethod: schema.tenures.assumptionMethod,
      verificationStatus: schema.tenures.verificationStatus, disputedFacts: schema.tenures.disputedFacts,
    }).from(schema.tenures).where(inArray(schema.tenures.personId, personIds)).orderBy(schema.tenures.id)).map(tenure => ({
      ...tenure, startDate: parsePartialDate(tenure.startDate), endDate: parsePartialDate(tenure.endDate), disputedFacts: [...tenure.disputedFacts].sort(),
    }));
    const offices = await tx.select({
      id: schema.offices.id, name: schema.offices.name, kind: schema.offices.kind, included: schema.offices.included, jurisdictionId: schema.offices.jurisdictionId,
    }).from(schema.offices).where(inArray(schema.offices.id, tenureRows.map(tenure => tenure.officeId))).orderBy(schema.offices.id);
    const constituencies = await tx.select({
      id: schema.constituencies.id, name: schema.constituencies.name, kind: schema.constituencies.kind, jurisdictionId: schema.constituencies.jurisdictionId,
    }).from(schema.constituencies).where(inArray(schema.constituencies.id, tenureRows.flatMap(tenure => tenure.constituencyId ? [tenure.constituencyId] : []))).orderBy(schema.constituencies.id);
    const electoralTerms = (await tx.select({
      id: schema.electoralTerms.id, officeId: schema.electoralTerms.officeId, startDate: schema.electoralTerms.startDate, endDate: schema.electoralTerms.endDate,
    }).from(schema.electoralTerms).where(inArray(schema.electoralTerms.id, tenureRows.flatMap(tenure => tenure.electoralTermId ? [tenure.electoralTermId] : []))).orderBy(schema.electoralTerms.id))
      .map(term => ({ ...term, startDate: parsePartialDate(term.startDate), endDate: parsePartialDate(term.endDate) }));

    const relationships = await tx.select({ fromId: schema.jurisdictionRelationships.fromId, toId: schema.jurisdictionRelationships.toId, kind: schema.jurisdictionRelationships.kind })
      .from(schema.jurisdictionRelationships).orderBy(schema.jurisdictionRelationships.fromId, schema.jurisdictionRelationships.toId, schema.jurisdictionRelationships.kind);
    const jurisdictionIds = new Set([...offices, ...constituencies].flatMap(row => row.jurisdictionId ? [row.jurisdictionId] : []));
    // Keep the referenced Jurisdictions and their geographic/administrative ancestors.
    for (let previousSize = -1; previousSize !== jurisdictionIds.size;) {
      previousSize = jurisdictionIds.size;
      for (const relation of relationships) if (jurisdictionIds.has(relation.fromId)) jurisdictionIds.add(relation.toId);
    }
    const jurisdictions = await tx.select({ id: schema.jurisdictions.id, name: schema.jurisdictions.name, kind: schema.jurisdictions.kind })
      .from(schema.jurisdictions).where(inArray(schema.jurisdictions.id, [...jurisdictionIds])).orderBy(schema.jurisdictions.id);
    const jurisdictionRelationships = relationships.filter(relation => jurisdictionIds.has(relation.fromId) && jurisdictionIds.has(relation.toId));
    const citationLinks = (await tx.select({ tenureId: schema.tenureCitations.tenureId, citationId: schema.tenureCitations.citationId, supports: schema.tenureCitations.supports })
      .from(schema.tenureCitations).where(inArray(schema.tenureCitations.tenureId, tenureRows.map(tenure => tenure.id)))
      .orderBy(schema.tenureCitations.tenureId, schema.tenureCitations.citationId)).map(citation => ({ ...citation, supports: [...citation.supports].sort() }));
    const citationRows = (await tx.select({
      id: schema.citations.id, title: schema.citations.title, url: schema.citations.url, publisher: schema.citations.publisher,
      type: schema.citations.type, publishedDate: schema.citations.publishedDate,
    }).from(schema.citations).where(inArray(schema.citations.id, citationLinks.map(citation => citation.citationId))).orderBy(schema.citations.id))
      .map(citation => ({ ...citation, publishedDate: parsePartialDate(citation.publishedDate) }));
    const projectedTenures = tenureRows.map(tenure => projectCorrections("tenure", {
      ...tenure, citations: citationLinks.filter(link => link.tenureId === tenure.id).map(link => ({ ...citationRows.find(citation => citation.id === link.citationId)!, supports: link.supports })),
    }, corrections));
    const tenures = projectedTenures.map(({ citations, ...tenure }) => ({ ...tenure, disputedFacts: [...tenure.disputedFacts].sort() }));
    const citationMap = new Map(citationRows.map(citation => [citation.id, citation]));
    const tenureCitations = projectedTenures.flatMap(tenure => [...tenure.citations].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(({ supports, ...citation }) => {
      citationMap.set(citation.id, citation);
      return { tenureId: tenure.id, citationId: citation.id, supports: [...supports].sort() };
    }));
    const citations = [...citationMap.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const filings = (await tx.select({
      id: schema.filings.id, personId: schema.filings.personId, filerName: schema.filings.filerName,
      reportingDate: schema.filings.reportingDate, executionDate: schema.filings.executionDate, receiptDate: schema.filings.receiptDate,
      supersedesFilingId: schema.filings.supersedesFilingId,
    }).from(schema.filings).where(inArray(schema.filings.personId, personIds)).orderBy(schema.filings.id)).map(filing => {
      const reportingDate = parsePartialDate(filing.reportingDate);
      if (!reportingDate) throw new Error("Stored Filing has no Reporting Date");
      return projectCorrections("filing", { ...filing, reportingDate, executionDate: parsePartialDate(filing.executionDate), receiptDate: parsePartialDate(filing.receiptDate) }, corrections);
    });
    const sourceDocuments = (await tx.select({
      id: schema.sourceDocuments.id, filingId: schema.sourceDocuments.filingId, fileName: schema.sourceDocuments.fileName,
      mediaType: schema.sourceDocuments.mediaType, byteSize: schema.sourceDocuments.byteSize, sha256: schema.sourceDocuments.sha256,
      originalUrl: schema.sourceDocuments.originalUrl, provenanceType: schema.sourceDocuments.provenanceType, provenanceNote: schema.sourceDocuments.provenanceNote,
      officialReleaseDate: schema.sourceDocuments.officialReleaseDate, acquisitionDate: schema.sourceDocuments.acquisitionDate,
      archivePublicationDate: schema.sourceDocuments.archivePublicationDate, transcriptionLevel: schema.sourceDocuments.transcriptionLevel,
    }).from(schema.sourceDocuments).innerJoin(schema.filings, eq(schema.filings.id, schema.sourceDocuments.filingId))
      .where(inArray(schema.filings.personId, personIds)).orderBy(schema.sourceDocuments.id)).map(document => {
      const acquisitionDate = parsePartialDate(document.acquisitionDate);
      if (!acquisitionDate) throw new Error("Stored Source Document has no Acquisition Date");
      return projectCorrections("source_document", { ...document, acquisitionDate, officialReleaseDate: parsePartialDate(document.officialReleaseDate) }, corrections);
    });
    const publicIds = { person: new Set(personIds), tenure: new Set(tenures.map(row => row.id)), filing: new Set(filings.map(row => row.id)), source_document: new Set(sourceDocuments.map(row => row.id)) };
    const editorialCorrections = corrections.filter(correction => publicIds[correction.target.type].has(correction.target.id))
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(correction => ({
        id: correction.id, target: { type: correction.target.type, id: correction.target.id },
        previousCorrectionId: correction.previousCorrectionId, revision: correction.revision, reason: correction.reason, reviewedAt: correction.reviewedAt,
        previousValues: orderedChanges(correction.previousValues), changes: orderedChanges(correction.changes),
        citations: [...correction.citations].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(citation => ({
          id: citation.id, title: citation.title, url: citation.url, publisher: citation.publisher, type: citation.type,
          publishedDate: citation.publishedDate, supports: [...citation.supports].sort(),
        })),
      }));
    return { people, personNames, offices, tenures, constituencies, jurisdictions, jurisdictionRelationships, electoralTerms, citations, tenureCitations, filings, sourceDocuments, editorialCorrections };
  });

  // The digest covers the schema version and ordered public content, without a clock or itself.
  const content = { schemaVersion: 1 as const, data };
  const version = createHash("sha256").update(JSON.stringify(content)).digest("hex");
  const snapshot = { schemaVersion: content.schemaVersion, version, data };
  const documents = new Map<string, { sha256: string; byteSize: number; mediaType: string; sourceDocumentIds: string[] }>();
  for (const document of data.sourceDocuments) {
    const existing = documents.get(document.sha256);
    if (existing) {
      if (existing.byteSize !== document.byteSize || existing.mediaType !== document.mediaType) throw new Error("Source Documents with one checksum have conflicting file metadata");
      existing.sourceDocumentIds.push(document.id);
    } else {
      documents.set(document.sha256, { sha256: document.sha256, byteSize: document.byteSize, mediaType: document.mediaType, sourceDocumentIds: [document.id] });
    }
  }
  const checksumManifest = { schemaVersion: 1 as const, version, algorithm: "sha256" as const, documents: [...documents.keys()].sort().map(checksum => documents.get(checksum)!) };
  return { snapshot, snapshotJson: JSON.stringify(snapshot, null, 2) + "\n", checksumManifest, checksumManifestJson: JSON.stringify(checksumManifest, null, 2) + "\n" };
}
