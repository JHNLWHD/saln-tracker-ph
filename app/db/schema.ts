import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Citation, Constituency, Jurisdiction, Office, SourceDocument, Tenure } from "../archive/types";

export const people = sqliteTable("people", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  canonicalName: text("canonical_name").notNull(),
  reviewedAt: text("reviewed_at").notNull(),
  reviewedBy: text("reviewed_by").notNull(),
}, (t) => [check("person_name_present", sql`length(trim(${t.canonicalName})) > 0`)]);

export const personNames = sqliteTable("person_names", {
  personId: text("person_id").notNull().references(() => people.id),
  value: text("value").notNull(),
}, (t) => [primaryKey({ columns: [t.personId, t.value] })]);

export const jurisdictions = sqliteTable("jurisdictions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").$type<Jurisdiction["kind"]>().notNull(),
}, (t) => [check("jurisdiction_kind", sql`${t.kind} in ('country','region','province','city','municipality','legislative_district')`)]);

export const jurisdictionRelationships = sqliteTable("jurisdiction_relationships", {
  fromId: text("from_id").notNull().references(() => jurisdictions.id),
  toId: text("to_id").notNull().references(() => jurisdictions.id),
  kind: text("kind", { enum: ["geographic", "administrative"] }).notNull(),
}, (t) => [
  primaryKey({ columns: [t.fromId, t.toId, t.kind] }),
  check("jurisdiction_relationship_kind", sql`${t.kind} in ('geographic','administrative')`),
  check("jurisdiction_not_self", sql`${t.fromId} != ${t.toId}`),
]);

export const offices = sqliteTable("offices", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").$type<Office["kind"]>().notNull(),
  included: integer("included", { mode: "boolean" }).notNull(),
  jurisdictionId: text("jurisdiction_id").references(() => jurisdictions.id),
}, (t) => [
  check("office_kind", sql`${t.kind} in ('elected','chamber_leadership')`),
  check("office_included", sql`${t.included} in (0,1)`),
]);

export const constituencies = sqliteTable("constituencies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").$type<Constituency["kind"]>().notNull(),
  jurisdictionId: text("jurisdiction_id").references(() => jurisdictions.id),
}, (t) => [check("constituency_kind", sql`${t.kind} in ('nation','legislative_district','party_list','provincial_district','local_district','at_large')`)]);

export const electoralTerms = sqliteTable("electoral_terms", {
  id: text("id").primaryKey(),
  officeId: text("office_id").notNull().references(() => offices.id),
  startDate: text("start_date"),
  endDate: text("end_date"),
});

export const tenures = sqliteTable("tenures", {
  id: text("id").primaryKey(),
  personId: text("person_id").notNull().references(() => people.id),
  officeId: text("office_id").notNull().references(() => offices.id),
  electoralTermId: text("electoral_term_id").references(() => electoralTerms.id),
  constituencyId: text("constituency_id").references(() => constituencies.id),
  startDate: text("start_date"),
  endDate: text("end_date"),
  assumptionMethod: text("assumption_method").$type<Tenure["assumptionMethod"]>().notNull(),
  verificationStatus: text("verification_status").$type<Tenure["verificationStatus"]>().notNull(),
  disputedFacts: text("disputed_facts", { mode: "json" }).$type<string[]>().notNull().default([]),
}, (t) => [
  index("tenures_person").on(t.personId),
  index("tenures_verification").on(t.verificationStatus, t.officeId),
  check("tenure_verification", sql`${t.verificationStatus} in ('verified','unverified','disputed')`),
  check("tenure_assumption", sql`${t.assumptionMethod} in ('election','succession','substitution','vacancy_appointment','chamber_selection','unknown')`),
  check("tenure_disputed_facts", sql`json_valid(${t.disputedFacts}) and json_type(${t.disputedFacts}) = 'array'`),
]);

export const citations = sqliteTable("citations", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  publisher: text("publisher").notNull(),
  type: text("type").$type<Citation["type"]>().notNull(),
  publishedDate: text("published_date"),
}, (t) => [check("citation_type", sql`${t.type} in ('official_record','public_article')`)]);

export const tenureCitations = sqliteTable("tenure_citations", {
  tenureId: text("tenure_id").notNull().references(() => tenures.id),
  citationId: text("citation_id").notNull().references(() => citations.id),
  supports: text("supports", { mode: "json" }).$type<string[]>().notNull(),
}, (t) => [
  primaryKey({ columns: [t.tenureId, t.citationId] }),
  check("tenure_citation_supports", sql`json_valid(${t.supports}) and json_type(${t.supports}) = 'array'`),
]);

export const filings = sqliteTable("filings", {
  id: text("id").primaryKey(),
  personId: text("person_id").notNull().references(() => people.id),
  filerName: text("filer_name").notNull(),
  reportingDate: text("reporting_date").notNull(),
  executionDate: text("execution_date"),
  receiptDate: text("receipt_date"),
  // A supersession needs an evidence workflow; do not infer it from a later year or upload.
  supersedesFilingId: text("supersedes_filing_id"),
  reviewedAt: text("reviewed_at").notNull(),
  reviewedBy: text("reviewed_by").notNull(),
}, (t) => [
  index("filings_person_reporting").on(t.personId, t.reportingDate),
  check("filing_filer_name", sql`length(trim(${t.filerName})) > 0`),
  check("filing_no_unreviewed_supersession", sql`${t.supersedesFilingId} is null`),
]);

export const sourceDocuments = sqliteTable("source_documents", {
  id: text("id").primaryKey(),
  filingId: text("filing_id").notNull().references(() => filings.id),
  fileName: text("file_name").notNull(),
  mediaType: text("media_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  sha256: text("sha256").notNull(),
  storageKey: text("storage_key").notNull(),
  originalUrl: text("original_url"),
  provenanceType: text("provenance_type").$type<SourceDocument["provenanceType"]>().notNull(),
  provenanceNote: text("provenance_note").notNull(),
  officialReleaseDate: text("official_release_date"),
  acquisitionDate: text("acquisition_date").notNull(),
  archivePublicationDate: text("archive_publication_date").notNull(),
  transcriptionLevel: text("transcription_level").$type<SourceDocument["transcriptionLevel"]>().notNull(),
}, (t) => [
  index("source_documents_filing").on(t.filingId),
  index("source_documents_checksum").on(t.sha256),
  index("source_documents_publication").on(t.archivePublicationDate),
  check("source_document_size", sql`${t.byteSize} > 0`),
  check("source_document_checksum", sql`length(${t.sha256}) = 64 and ${t.sha256} not glob '*[^0-9a-f]*'`),
  check("source_document_storage_key", sql`${t.storageKey} = 'documents/sha256/' || ${t.sha256}`),
  check("source_document_media_type", sql`${t.mediaType} in ('application/pdf','image/jpeg','image/png')`),
  check("source_document_provenance", sql`${t.provenanceType} in ('official_download','formal_release','preserved_copy')`),
  check("source_document_provenance_note", sql`length(trim(${t.provenanceNote})) > 0`),
  check("source_document_transcription", sql`${t.transcriptionLevel} in ('document_only','summary_totals','full_itemization')`),
]);

export const manifestApplications = sqliteTable("manifest_applications", {
  id: text("id").primaryKey(),
  version: integer("version").notNull(),
  kind: text("kind", { enum: ["person", "filing"] }).notNull(),
  digest: text("digest").notNull(),
  canonicalPayload: text("canonical_payload").notNull(),
  appliedAt: text("applied_at").notNull(),
}, (t) => [
  check("manifest_version", sql`${t.version} = 1`),
  check("manifest_kind", sql`${t.kind} in ('person','filing')`),
  check("manifest_digest", sql`length(${t.digest}) = 64 and ${t.digest} not glob '*[^0-9a-f]*'`),
  check("manifest_payload", sql`json_valid(${t.canonicalPayload}) and json_type(${t.canonicalPayload}) = 'object'`),
]);
