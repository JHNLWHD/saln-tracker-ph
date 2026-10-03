import type { DirectoryFilters, DirectoryResult, PersonRecord } from './types';

export const searchText = (value: string) => value.normalize('NFC').toLocaleLowerCase('en-PH');

export function directoryFilters(params: URLSearchParams): DirectoryFilters {
  const allowed = ['q', 'office', 'jurisdiction', 'tenure', 'documents', 'year', 'page'];
  for (const key of params.keys()) if (!allowed.includes(key) || params.getAll(key).length !== 1) throw new Error('Unsupported or repeated directory filter');
  const get = (key: string) => (params.get(key) ?? '').trim();
  const q = get('q'), office = get('office'), jurisdiction = get('jurisdiction'), tenure = get('tenure'), documents = get('documents'), year = get('year'), page = get('page') || '1';
  if ([q, office, jurisdiction].some(value => value.length > 128) || !['', 'current', 'former'].includes(tenure) || !['', 'available', 'none'].includes(documents) || (year && !/^(?!0000)\d{4}$/.test(year)) || !/^[1-9]\d{0,5}$/.test(page)) throw new Error('Invalid directory filter');
  return { q, office, jurisdiction, tenure: tenure as DirectoryFilters['tenure'], documents: documents as DirectoryFilters['documents'], year, page: Number(page) };
}

export function directoryHref(filters: DirectoryFilters, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, page })) if (value !== '' && !(key === 'page' && value === 1)) params.set(key, String(value));
  return `/people${params.size ? `?${params}` : ''}`;
}

/** The fixture adapter uses the same public fields; deployed directories use native SQL. */
export function directoryFromRecords(records: PersonRecord[], filters: DirectoryFilters): DirectoryResult {
  const eligible = records.filter(record => record.person.eligibility === 'eligible');
  const publicTenures = (record: PersonRecord) => record.tenures.filter(t => t.verificationStatus !== 'unverified' && !t.disputedFacts.some(fact => ['person', 'office'].includes(fact)) && record.offices.some(o => o.id === t.officeId && o.included));
  const publicOffices = (record: PersonRecord) => record.offices.filter(o => publicTenures(record).some(t => t.officeId === o.id));
  const directJurisdictions = (record: PersonRecord, tenures: PersonRecord['tenures']) => new Set(tenures.flatMap(t => [record.offices.find(o => o.id === t.officeId)?.jurisdictionId, record.constituencies.find(c => c.id === t.constituencyId)?.jurisdictionId]).filter((id): id is string => Boolean(id)));
  const jurisdictionAncestors = (record: PersonRecord, ids: Set<string>) => {
    for (const id of ids) for (const relationship of record.jurisdictionRelationships ?? []) if (relationship.fromId === id) ids.add(relationship.toId);
    return ids;
  };
  const publicJurisdictions = (record: PersonRecord) => {
    const ids = jurisdictionAncestors(record, directJurisdictions(record, publicTenures(record)));
    return record.jurisdictions.filter(j => ids.has(j.id));
  };
  const matches = eligible.filter(record => {
    const tenures = publicTenures(record);
    const current = (id: string) => record.rosterMemberships?.some(m => m.tenureId === id);
    const offices = publicOffices(record), constituencies = record.constituencies.filter(c => tenures.some(t => t.constituencyId === c.id));
    const directIds = directJurisdictions(record, tenures);
    const jurisdictions = record.jurisdictions.filter(j => directIds.has(j.id));
    const fields = [record.person.canonicalName, ...record.person.nameVariants, ...record.filings.map(f => f.filerName), ...offices.map(o => o.name), ...constituencies.map(c => c.name), ...jurisdictions.map(j => j.name)];
    return (!filters.q || fields.some(value => searchText(value).includes(searchText(filters.q)))) &&
      tenures.some(t => (!filters.office || t.officeId === filters.office) && (!filters.jurisdiction || jurisdictionAncestors(record, directJurisdictions(record, [t])).has(filters.jurisdiction)) && (!filters.tenure || (filters.tenure === 'current' ? current(t.id) : t.endDate && !current(t.id)))) &&
      (!filters.documents || (record.sourceDocuments.length > 0) === (filters.documents === 'available')) && (!filters.year || record.filings.some(f => f.reportingDate.value.startsWith(filters.year)));
  }).sort((a, b) => a.person.canonicalName.localeCompare(b.person.canonicalName) || a.person.id.localeCompare(b.person.id));
  const page = Math.min(filters.page, Math.max(1, Math.ceil(matches.length / 30)));
  return { total: matches.length, page, pageSize: 30, rows: matches.slice((page - 1) * 30, page * 30).map(record => ({ id: record.person.id, slug: record.person.slug, canonicalName: record.person.canonicalName, documentCount: new Set(record.sourceDocuments.map(d => d.sha256)).size, offices: publicOffices(record).map(o => o.name) })), offices: [...new Map(eligible.flatMap(r => publicOffices(r).map(o => [o.id, { id: o.id, name: o.name }]))).values()], jurisdictions: [...new Map(eligible.flatMap(r => publicJurisdictions(r).map(j => [j.id, { id: j.id, name: j.name }]))).values()] };
}
