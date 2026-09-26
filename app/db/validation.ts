import type { Citation, Constituency, ElectoralTerm, Jurisdiction, Office, PartialDate, PersonRecord, Tenure } from "../archive/types";

const facts = ["person", "office", "startDate", "endDate", "assumptionMethod"] as const;
type Data = Record<string, unknown>;

export function object(value: unknown, fields: string[], path: string): Data {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} must be an object`);
  const result = value as Data;
  for (const key of Object.keys(result)) if (!fields.includes(key)) throw new Error(`${path}.${key} is not supported`);
  return result;
}

export function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) throw new Error(`${path} must be non-empty trimmed text`);
  return value;
}

function nullableText(value: unknown, path: string): string | null {
  return value === null ? null : text(value, path);
}

export function choice<T extends string>(value: unknown, options: readonly T[], path: string): T {
  if (typeof value !== "string" || !options.includes(value as T)) throw new Error(`${path} is not a supported value`);
  return value as T;
}

function array<T>(value: unknown, parse: (item: unknown, path: string) => T, path: string): T[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value.map((item, i) => parse(item, `${path}[${i}]`));
}

function strings(value: unknown, path: string): string[] {
  const result = array(value, text, path);
  if (new Set(result).size !== result.length) throw new Error(`${path} contains duplicates`);
  return result;
}

export function parsePartialDate(value: string | null): PartialDate | null {
  if (value === null) return null;
  if (!/^[0-9]{4}(-[0-9]{2})?(-[0-9]{2})?$/.test(value) || value.startsWith("0000")) throw new Error(`Invalid partial date: ${value}`);
  const precision = value.length === 4 ? "year" : value.length === 7 ? "month" : "day";
  // Padding is used only to validate the calendar. It is never persisted.
  const calendar = value + (precision === "year" ? "-01-01" : precision === "month" ? "-01" : "");
  const parsed = new Date(`${calendar}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== calendar) throw new Error(`Invalid partial date: ${value}`);
  return { value, precision };
}

export function date(value: unknown, path: string): PartialDate | null {
  if (value === null) return null;
  const row = object(value, ["value", "precision"], path);
  const parsed = parsePartialDate(text(row.value, `${path}.value`));
  if (row.precision !== parsed?.precision) throw new Error(`${path}.precision does not match its value`);
  return parsed;
}

function interval(start: PartialDate | null, end: PartialDate | null, path: string) {
  if (!start || !end) return;
  const earliestStart = start.value + (start.precision === "year" ? "-01-01" : start.precision === "month" ? "-01" : "");
  const latestEnd = end.value + (end.precision === "year" ? "-12-31" : end.precision === "month" ? "-31" : "");
  if (latestEnd < earliestStart) throw new Error(`${path} ends before it starts`);
}

function citation(value: unknown, path: string): Citation {
  const row = object(value, ["id", "title", "url", "publisher", "type", "supports", "publishedDate"], path);
  const url = text(row.url, `${path}.url`);
  const parsed = new URL(url);
  if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error(`${path}.url must be a public HTTP URL`);
  const supports = strings(row.supports, `${path}.supports`);
  supports.forEach(value => choice(value, facts, `${path}.supports`));
  return {
    id: text(row.id, `${path}.id`), title: text(row.title, `${path}.title`), url,
    publisher: text(row.publisher, `${path}.publisher`),
    type: choice(row.type, ["official_record", "public_article"], `${path}.type`),
    supports, publishedDate: date(row.publishedDate, `${path}.publishedDate`),
  };
}

export interface ReviewedPerson {
  review: { reviewedAt: string; reviewedBy: string };
  person: { id: string; slug: string; canonicalName: string; nameVariants: string[] };
  offices: Office[];
  jurisdictions: Jurisdiction[];
  jurisdictionRelationships: { fromId: string; toId: string; kind: "geographic" | "administrative" }[];
  constituencies: Constituency[];
  electoralTerms: ElectoralTerm[];
  tenures: Tenure[];
}

export function hasEligibleTenure(record: Pick<PersonRecord, "offices" | "tenures">): boolean {
  return record.tenures.some(tenure => tenure.verificationStatus !== "unverified" &&
    !tenure.disputedFacts.some(fact => fact === "person" || fact === "office") &&
    tenure.citations.some(source => source.supports.includes("person") && source.supports.includes("office")) &&
    record.offices.some(office => office.id === tenure.officeId && office.kind === "elected" && office.included));
}

export function validateReviewedPerson(value: unknown): ReviewedPerson {
  const root = object(value, ["review", "person", "offices", "jurisdictions", "jurisdictionRelationships", "constituencies", "electoralTerms", "tenures"], "record");
  const review = object(root.review, ["reviewedAt", "reviewedBy"], "review");
  const reviewedAt = text(review.reviewedAt, "review.reviewedAt");
  if (parsePartialDate(reviewedAt)?.precision !== "day") throw new Error("review.reviewedAt must be a calendar date");
  const person = object(root.person, ["id", "slug", "canonicalName", "nameVariants"], "person");
  const slug = text(person.slug, "person.slug");
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(slug)) throw new Error("person.slug must be URL-safe");
  const result: ReviewedPerson = {
    review: { reviewedAt, reviewedBy: text(review.reviewedBy, "review.reviewedBy") },
    person: { id: text(person.id, "person.id"), slug, canonicalName: text(person.canonicalName, "person.canonicalName"), nameVariants: strings(person.nameVariants, "person.nameVariants") },
    jurisdictions: array(root.jurisdictions, (value, path) => {
      const row = object(value, ["id", "name", "kind"], path);
      return { id: text(row.id, `${path}.id`), name: text(row.name, `${path}.name`), kind: choice(row.kind, ["country", "region", "province", "city", "municipality", "legislative_district"], `${path}.kind`) };
    }, "jurisdictions"),
    jurisdictionRelationships: array(root.jurisdictionRelationships, (value, path) => {
      const row = object(value, ["fromId", "toId", "kind"], path);
      return { fromId: text(row.fromId, `${path}.fromId`), toId: text(row.toId, `${path}.toId`), kind: choice(row.kind, ["geographic", "administrative"], `${path}.kind`) };
    }, "jurisdictionRelationships"),
    offices: array(root.offices, (value, path) => {
      const row = object(value, ["id", "name", "kind", "included", "jurisdictionId"], path);
      if (typeof row.included !== "boolean") throw new Error(`${path}.included must be a boolean`);
      return { id: text(row.id, `${path}.id`), name: text(row.name, `${path}.name`), kind: choice(row.kind, ["elected", "chamber_leadership"], `${path}.kind`), included: row.included, jurisdictionId: nullableText(row.jurisdictionId, `${path}.jurisdictionId`) };
    }, "offices"),
    constituencies: array(root.constituencies, (value, path) => {
      const row = object(value, ["id", "name", "kind", "jurisdictionId"], path);
      return { id: text(row.id, `${path}.id`), name: text(row.name, `${path}.name`), kind: choice(row.kind, ["nation", "legislative_district", "party_list", "provincial_district", "local_district", "at_large"], `${path}.kind`), jurisdictionId: nullableText(row.jurisdictionId, `${path}.jurisdictionId`) };
    }, "constituencies"),
    electoralTerms: array(root.electoralTerms, (value, path) => {
      const row = object(value, ["id", "officeId", "startDate", "endDate"], path);
      const startDate = date(row.startDate, `${path}.startDate`), endDate = date(row.endDate, `${path}.endDate`);
      interval(startDate, endDate, path);
      return { id: text(row.id, `${path}.id`), officeId: text(row.officeId, `${path}.officeId`), startDate, endDate };
    }, "electoralTerms"),
    tenures: array(root.tenures, (value, path) => {
      const row = object(value, ["id", "personId", "officeId", "electoralTermId", "constituencyId", "startDate", "endDate", "assumptionMethod", "verificationStatus", "disputedFacts", "citations"], path);
      const startDate = date(row.startDate, `${path}.startDate`), endDate = date(row.endDate, `${path}.endDate`);
      interval(startDate, endDate, path);
      const disputedFacts = strings(row.disputedFacts, `${path}.disputedFacts`);
      disputedFacts.forEach(value => choice(value, facts, `${path}.disputedFacts`));
      return {
        id: text(row.id, `${path}.id`), personId: text(row.personId, `${path}.personId`), officeId: text(row.officeId, `${path}.officeId`),
        electoralTermId: nullableText(row.electoralTermId, `${path}.electoralTermId`), constituencyId: nullableText(row.constituencyId, `${path}.constituencyId`),
        startDate, endDate, assumptionMethod: choice(row.assumptionMethod, ["election", "succession", "substitution", "vacancy_appointment", "chamber_selection", "unknown"], `${path}.assumptionMethod`),
        verificationStatus: choice(row.verificationStatus, ["verified", "unverified", "disputed"], `${path}.verificationStatus`), disputedFacts,
        citations: array(row.citations, citation, `${path}.citations`),
      };
    }, "tenures"),
  };
  const ids = (items: { id: string }[], name: string) => {
    const values = new Set(items.map(item => item.id));
    if (values.size !== items.length) throw new Error(`${name} contains duplicate IDs`);
    return values;
  };
  const jurisdictionIds = ids(result.jurisdictions, "jurisdictions"), officeIds = ids(result.offices, "offices");
  const constituencyIds = ids(result.constituencies, "constituencies"), termIds = ids(result.electoralTerms, "electoralTerms");
  ids(result.tenures, "tenures");
  function reference(value: string | null, values: Set<string>, field: string) {
    if (value !== null && !values.has(value)) throw new Error(`${field} refers to an unknown ID: ${value}`);
  }
  for (const row of [...result.offices, ...result.constituencies]) reference(row.jurisdictionId, jurisdictionIds, "jurisdictionId");
  const relationships = new Set<string>();
  for (const row of result.jurisdictionRelationships) {
    reference(row.fromId, jurisdictionIds, "fromId"); reference(row.toId, jurisdictionIds, "toId");
    if (row.fromId === row.toId) throw new Error("A jurisdiction cannot relate to itself");
    const key = JSON.stringify(row);
    if (relationships.has(key)) throw new Error("Duplicate jurisdiction relationship");
    relationships.add(key);
  }
  for (const term of result.electoralTerms) reference(term.officeId, officeIds, "electoralTerm.officeId");
  const sources = new Map<string, string>();
  for (const tenure of result.tenures) {
    if (tenure.personId !== result.person.id) throw new Error("tenure.personId does not match the Person");
    reference(tenure.officeId, officeIds, "tenure.officeId");
    reference(tenure.constituencyId, constituencyIds, "tenure.constituencyId");
    reference(tenure.electoralTermId, termIds, "tenure.electoralTermId");
    if (tenure.electoralTermId && result.electoralTerms.find(term => term.id === tenure.electoralTermId)?.officeId !== tenure.officeId) throw new Error("Tenure and Electoral Term must refer to the same Office");
    ids(tenure.citations, "tenure.citations");
    for (const source of tenure.citations) {
      const { supports, ...metadata } = source;
      const saved = sources.get(source.id), current = JSON.stringify(metadata);
      if (saved && saved !== current) throw new Error("Citation ID has conflicting metadata");
      sources.set(source.id, current);
    }
    if (tenure.verificationStatus !== "unverified" && !tenure.citations.some(source => source.supports.includes("person") && source.supports.includes("office"))) throw new Error("Verified identity and Office need an attributable citation supporting both");
    if (tenure.verificationStatus === "disputed" && !tenure.disputedFacts.length) throw new Error("A disputed Tenure must name its disputed facts");
    if (tenure.disputedFacts.some(fact => fact === "person" || fact === "office") && tenure.verificationStatus !== "disputed") throw new Error("Disputed identity or Office must be marked disputed");
    for (const field of ["startDate", "endDate"] as const) {
      if (tenure[field] && !tenure.citations.some(source => source.supports.includes(field))) throw new Error(`${field} needs supporting evidence`);
    }
    if (tenure.assumptionMethod !== "unknown" && !tenure.citations.some(source => source.supports.includes("assumptionMethod"))) throw new Error("Assumption Method needs supporting evidence");
  }
  return result;
}
