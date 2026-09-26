import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PersonRecord } from '../app/archive/types';
import { PersonProfile } from '../app/components/PersonProfile';

const record: PersonRecord = {
  person: { id: 'person-1', slug: 'sample-person', canonicalName: 'Sample Person', nameVariants: ['Person, Sample'], legacySlugs: [], eligibility: 'eligible' },
  offices: [{ id: 'senator', name: 'Senator', kind: 'elected', included: true, jurisdictionId: 'ph' }],
  tenures: [{ id: 'tenure-1', personId: 'person-1', officeId: 'senator', electoralTermId: null, constituencyId: 'national', startDate: { value: '2022', precision: 'year' }, endDate: null, assumptionMethod: 'election', verificationStatus: 'verified', disputedFacts: [], citations: [{ id: 'source-1', title: 'Sample Person joins Senate', publisher: 'Public News', url: 'https://example.org/tenure', type: 'public_article', supports: ['Person', 'Office', 'start year'], publishedDate: { value: '2022-07', precision: 'month' } }] }],
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
