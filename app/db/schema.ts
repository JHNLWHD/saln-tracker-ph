import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Citation, Constituency, Jurisdiction, Office, Tenure } from "../archive/types";

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
