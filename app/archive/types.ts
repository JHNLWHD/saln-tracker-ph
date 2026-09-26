/** Date precision comes from evidence; unknown dates are null. */
export interface PartialDate {
  value: string;
  precision: "year" | "month" | "day";
}

export interface Citation {
  id: string;
  title: string;
  url: string;
  publisher: string;
  type: "official_record" | "public_article";
  supports: string[];
  publishedDate: PartialDate | null;
}

export interface Person {
  id: string;
  slug: string;
  canonicalName: string;
  nameVariants: string[];
  legacySlugs: string[];
  eligibility: "eligible" | "unverified" | "disputed";
}

export interface Office {
  id: string;
  name: string;
  kind: "elected" | "chamber_leadership";
  included: boolean;
  jurisdictionId: string | null;
}

export interface Jurisdiction {
  id: string;
  name: string;
  kind: "country" | "region" | "province" | "city" | "municipality" | "legislative_district";
}

export interface Constituency {
  id: string;
  name: string;
  kind: "nation" | "legislative_district" | "party_list" | "provincial_district" | "local_district" | "at_large";
  jurisdictionId: string | null;
}

export interface ElectoralTerm {
  id: string;
  officeId: string;
  startDate: PartialDate | null;
  endDate: PartialDate | null;
}

export interface Tenure {
  id: string;
  personId: string;
  officeId: string;
  electoralTermId: string | null;
  constituencyId: string | null;
  startDate: PartialDate | null;
  endDate: PartialDate | null;
  assumptionMethod: "election" | "succession" | "substitution" | "vacancy_appointment" | "chamber_selection" | "unknown";
  verificationStatus: "verified" | "unverified" | "disputed";
  disputedFacts: string[];
  citations: Citation[];
}

export interface Filing {
  id: string;
  personId: string;
  filerName: string;
  reportingDate: PartialDate;
  executionDate: PartialDate | null;
  receiptDate: PartialDate | null;
  supersedesFilingId: string | null;
}

export interface SourceDocument {
  id: string;
  filingId: string;
  fileName: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
  storageKey: string;
  originalUrl: string | null;
  provenanceType: "official_download" | "formal_release" | "preserved_copy";
  provenanceNote: string;
  officialReleaseDate: PartialDate | null;
  acquisitionDate: PartialDate;
  archivePublicationDate: string;
  transcriptionLevel: "document_only" | "summary_totals" | "full_itemization";
}

/** Decimal strings retain the exact reviewed amounts without binary rounding. */
export interface DeclaredFinancialSummary {
  id: string;
  filingId: string;
  sourceDocumentId: string;
  totalAssets: string;
  totalLiabilities: string;
  declaredNetWorth: string;
  currency: "PHP";
  reviewedAt: string;
}

export type CorrectionTargetType = "person" | "tenure" | "filing" | "source_document";
export type CorrectionChanges = Partial<
  Pick<Person, "canonicalName" | "nameVariants"> &
  Pick<Tenure, "startDate" | "endDate" | "assumptionMethod" | "verificationStatus" | "disputedFacts"> &
  Pick<Filing, "filerName" | "reportingDate" | "executionDate" | "receiptDate"> &
  Pick<SourceDocument, "fileName" | "originalUrl" | "provenanceType" | "provenanceNote" | "officialReleaseDate" | "acquisitionDate" | "archivePublicationDate">
>;

export interface EditorialCorrection {
  id: string;
  target: { type: CorrectionTargetType; id: string };
  previousCorrectionId: string | null;
  revision: number;
  reason: string;
  reviewedAt: string;
  previousValues: CorrectionChanges;
  changes: CorrectionChanges;
  citations: Citation[];
}

export interface PersonRecord {
  person: Person;
  offices: Office[];
  tenures: Tenure[];
  constituencies: Constituency[];
  jurisdictions: Jurisdiction[];
  electoralTerms: ElectoralTerm[];
  filings: Filing[];
  sourceDocuments: SourceDocument[];
  financialSummaries: DeclaredFinancialSummary[];
  editorialCorrections?: EditorialCorrection[];
}

export interface Archive {
  listPeople(): Promise<PersonRecord[]>;
  findPersonBySlug(slug: string): Promise<PersonRecord | null>;
  findSourceDocument(sha256: string): Promise<SourceDocument | null>;
}
