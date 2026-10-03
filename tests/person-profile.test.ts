import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PersonRecord } from '../app/archive/types';
import { PersonProfile } from '../app/components/PersonProfile';

const record: PersonRecord = {
  person: { id: 'person-1', slug: 'sample-person', canonicalName: 'Sample Person', nameVariants: ['Person, Sample'], legacySlugs: [], eligibility: 'eligible' },
  offices: [{ id: 'senator', name: 'Senator', kind: 'elected', included: true, jurisdictionId: 'ph' }],
  tenures: [{ id: 'tenure-1', personId: 'person-1', officeId: 'senator', electoralTermId: null, constituencyId: 'national', startDate: { value: '2022', precision: 'year' }, endDate: null, assumptionMethod: 'election', verificationStatus: 'verified', disputedFacts: [], citations: [{ id: 'source-1', title: 'Sample Person joins Senate', publisher: 'Public News', url: 'https://example.org/tenure', type: 'public_article', supports: ['person', 'office', 'startDate', 'assumptionMethod'], publishedDate: { value: '2022-07', precision: 'month' } }] }],
  constituencies: [{ id: 'national', name: 'National electorate', kind: 'nation', jurisdictionId: 'ph' }],
  jurisdictions: [{ id: 'ph', name: 'Philippines', kind: 'country' }],
  electoralTerms: [], filings: [], sourceDocuments: [], financialSummaries: [],
};

const render = (value: PersonRecord) => renderToStaticMarkup(createElement(PersonProfile, { record: value }));

test('Person profile shows supported identity, Tenure evidence, and partial dates without an inferred end', () => {
  const html = render(record);
  assert.match(html, /<h1>Sample Person<\/h1>/);
  assert.match(html, /Name Variants/);
  assert.match(html, /Person, Sample/);
  assert.match(html, />Senator<\/h3>/);
  assert.match(html, /Verified Tenure/);
  assert.match(html, /<span>2022<\/span>.*\(year precision\)/);
  assert.match(html, /dateTime="2022-07">2022-07<\/time>/);
  assert.match(html, /End date<\/dt><dd>Not established<\/dd>/);
  assert.match(html, /Election/);
  assert.match(html, /National electorate/);
  assert.match(html, /Philippines/);
  assert.match(html, /href="https:\/\/example.org\/tenure"[^>]*>Sample Person joins Senate<\/a>/);
  assert.match(html, /Public News · Public article/);
  assert.match(html, /Supports: Person, Office, Start date, Assumption Method/);
  assert.doesNotMatch(html, /Supports:[^<]*(?:startDate|assumptionMethod)/);
  assert.match(html, /No SALN currently in the archive/);
  assert.match(html, /does not establish that the Person failed to file/);
  assert.doesNotMatch(html, /2022-01-01|Present|Current official|Former official|₱0/);
});

test('disputed eligibility remains explicit and retains each conflicting citation', () => {
  const disputed = structuredClone(record);
  disputed.person.eligibility = 'disputed';
  disputed.tenures[0].verificationStatus = 'disputed';
  disputed.tenures[0].disputedFacts = ['The included Office is disputed'];
  disputed.tenures[0].citations.push({ ...disputed.tenures[0].citations[0], id: 'source-2', title: 'Conflicting Office report', url: 'https://example.org/conflict', publisher: 'Other News', publishedDate: null });
  const html = render(disputed);
  assert.match(html, /Archive eligibility is disputed/);
  assert.match(html, /excluded from public directories, search, and coverage counts/);
  assert.match(html, /Disputed Tenure/);
  assert.match(html, /The included Office is disputed/);
  assert.match(html, /href="https:\/\/example.org\/tenure"/);
  assert.match(html, /href="https:\/\/example.org\/conflict"/);
  assert.match(html, /Other News · Public article/);
  assert.match(html, /Published: Not established/);
  assert.match(html, /Source Documents are not shown while Archive eligibility is unresolved/);
  assert.doesNotMatch(html, /No SALN currently in the archive|project has not acquired/);
});

test('unverified legacy profile does not display excluded Offices as evidence of eligibility', () => {
  const unverified = structuredClone(record);
  unverified.person.eligibility = 'unverified';
  unverified.offices[0].included = false;
  const html = render(unverified);
  assert.match(html, /Archive eligibility is not verified/);
  assert.match(html, /legacy profile remains available for link continuity/);
  assert.match(html, /No Tenure in an included Office has been established/);
  assert.doesNotMatch(html, />Senator<\/h3>/);
});

function documentRecord(): PersonRecord {
  const value = structuredClone(record);
  value.filings = [{ id: 'filing-1', personId: value.person.id, filerName: 'PERSON, SAMPLE', reportingDate: { value: '2024', precision: 'year' }, executionDate: null, receiptDate: null, supersedesFilingId: null }];
  value.sourceDocuments = [{ id: 'document-1', filingId: 'filing-1', fileName: 'sample-saln.pdf', mediaType: 'application/pdf', byteSize: 1234, sha256: 'a'.repeat(64), storageKey: 'private-storage-key', originalUrl: 'https://example.org/source.pdf', provenanceType: 'official_download', provenanceNote: 'Acquired from the custodian publication.', officialReleaseDate: null, acquisitionDate: { value: '2026-09', precision: 'month' }, archivePublicationDate: '2026-09-26T10:00:00.000Z', transcriptionLevel: 'document_only' }];
  return value;
}

test('Document-only Filing shows provenance and separate stable open/download actions without invented dates or totals', () => {
  const html = render(documentRecord());
  const route = `/documents/${'a'.repeat(64)}`;
  assert.ok(html.indexOf('SALN Filings') < html.indexOf('Public office and evidence'));
  assert.match(html, /Reporting Date: <span>2024<\/span>.*\(year precision\)/);
  assert.match(html, /Filer Name<\/dt><dd>PERSON, SAMPLE<\/dd>/);
  assert.match(html, /Execution Date<\/dt><dd>Not established<\/dd>/);
  assert.match(html, /Receipt Date<\/dt><dd>Not established<\/dd>/);
  assert.match(html, /Official Release Date<\/dt><dd>Not established<\/dd>/);
  assert.match(html, /dateTime="2026-09">2026-09<\/time>/);
  assert.match(html, /dateTime="2026-09-26T10:00:00.000Z"/);
  assert.match(html, /Official download/);
  assert.match(html, /Acquired from the custodian publication/);
  assert.match(html, /href="https:\/\/example.org\/source.pdf"/);
  assert.match(html, /Document only/);
  assert.match(html, /No reviewed summary totals are available for this Filing/);
  assert.ok(html.includes(`href="${route}">Open<span class="sr-only"> sample-saln.pdf</span>`));
  assert.ok(html.includes(`href="${route}?download=1" download="sample-saln.pdf">Download<span class="sr-only"> sample-saln.pdf</span>`));
  assert.match(html, /<th scope="col">Provenance<\/th>/);
  assert.doesNotMatch(html, /No SALN currently in the archive|₱0|2024-12-31|2026-09-01|private-storage-key/);
});

test('same-period Filings and their multiple Source Documents remain separate', () => {
  const value = documentRecord();
  value.filings.push({ ...value.filings[0], id: 'filing-2', filerName: 'Sample P. Person' });
  value.sourceDocuments.push(
    { ...value.sourceDocuments[0], id: 'document-2', fileName: 'preserved-copy.pdf', sha256: 'b'.repeat(64), originalUrl: null, provenanceType: 'preserved_copy', provenanceNote: 'Exact copy preserved from the recorded custodian.' },
    { ...value.sourceDocuments[0], id: 'document-3', filingId: 'filing-2', fileName: 'separate-filing.pdf', sha256: 'c'.repeat(64), provenanceType: 'formal_release', provenanceNote: 'Released by the records custodian.' },
  );
  const html = render(value);
  assert.equal((html.match(/Reporting Date: <span>2024<\/span>/g) || []).length, 2);
  assert.equal((html.match(/<table /g) || []).length, 2);
  assert.equal((html.match(/>Open<span/g) || []).length, 3);
  assert.equal((html.match(/No reviewed summary totals are available for this Filing/g) || []).length, 2);
  const firstTable = html.slice(html.indexOf('<table'), html.indexOf('</table>'));
  const secondTable = html.slice(html.indexOf('<table', html.indexOf('</table>')));
  assert.match(firstTable, /sample-saln.pdf/);
  assert.match(firstTable, /preserved-copy.pdf/);
  assert.match(firstTable, /Preserved Copy/);
  assert.doesNotMatch(firstTable, /separate-filing.pdf/);
  assert.match(secondTable, /separate-filing.pdf/);
  assert.match(secondTable, /Formally released copy/);
  assert.doesNotMatch(secondTable, /preserved-copy.pdf/);
  assert.doesNotMatch(html, /supersed|amendment|latest Filing/i);
});

test('corrected profile values show their history, reasons, date precision, and all conflict citations', () => {
  const value = documentRecord();
  const conflict = { ...value.tenures[0].citations[0], id: 'conflict-citation', title: 'Conflicting start-date report', publisher: 'Other News', url: 'https://example.org/corrected-date', supports: ['startDate'] };
  value.person.canonicalName = 'Sample Corrected Person';
  value.filings[0].reportingDate = { value: '2023-12', precision: 'month' };
  value.tenures[0].startDate = null;
  value.tenures[0].verificationStatus = 'disputed';
  value.tenures[0].disputedFacts = ['startDate'];
  value.tenures[0].citations.push(conflict);
  value.editorialCorrections = [
    { id: 'name-correction', target: { type: 'person', id: value.person.id }, previousCorrectionId: null, revision: 1, reason: 'Corrected the preferred display name after source review.', reviewedAt: '2026-09-26', previousValues: { canonicalName: 'Sample Person' }, changes: { canonicalName: value.person.canonicalName }, citations: [value.tenures[0].citations[0]] },
    { id: 'filing-correction-1', target: { type: 'filing', id: 'filing-1' }, previousCorrectionId: null, revision: 1, reason: 'Corrected the transcribed Reporting Date.', reviewedAt: '2026-09-26', previousValues: { reportingDate: { value: '2024', precision: 'year' } }, changes: { reportingDate: { value: '2023', precision: 'year' } }, citations: [] },
    { id: 'filing-correction-2', target: { type: 'filing', id: 'filing-1' }, previousCorrectionId: 'filing-correction-1', revision: 2, reason: 'Month precision is supported by the Source Document.', reviewedAt: '2026-09-27', previousValues: { reportingDate: { value: '2023', precision: 'year' } }, changes: { reportingDate: value.filings[0].reportingDate }, citations: [] },
    { id: 'tenure-correction', target: { type: 'tenure', id: 'tenure-1' }, previousCorrectionId: null, revision: 1, reason: 'Attributable reports conflict about the start date.', reviewedAt: '2026-09-27', previousValues: { startDate: { value: '2022', precision: 'year' }, verificationStatus: 'verified', disputedFacts: [] }, changes: { startDate: null, verificationStatus: 'disputed', disputedFacts: ['startDate'] }, citations: [conflict] },
  ];
  const html = render(value);
  assert.match(html, /<h1>Sample Corrected Person<\/h1>/);
  assert.match(html, /Reporting Date: <time dateTime="2023-12">2023-12<\/time>.*\(month precision\)/);
  assert.match(html, /Editorial Corrections/);
  assert.match(html, /This page uses the latest reviewed metadata/);
  assert.match(html, /Previously: Sample Person/);
  assert.match(html, /Corrected: Sample Corrected Person/);
  assert.match(html, /Corrected the transcribed Reporting Date/);
  assert.match(html, /Month precision is supported by the Source Document/);
  assert.match(html, /Filing metadata · Correction 2/);
  assert.match(html, /Record: filing-1/);
  assert.match(html, /Start date<\/dt><dd>Previously: <span>2022<\/span>.*<dd>Corrected: Not established/);
  assert.match(html, /<li>Start date<\/li>/);
  assert.match(html, /href="https:\/\/example.org\/tenure"/);
  assert.match(html, /href="https:\/\/example.org\/corrected-date"/);
  assert.match(html, /Other News · Public article/);
  assert.ok(html.includes(`href="/documents/${'a'.repeat(64)}">Open`));
  assert.doesNotMatch(html, /Archive eligibility is disputed|2023-12-01|>startDate</);
});
