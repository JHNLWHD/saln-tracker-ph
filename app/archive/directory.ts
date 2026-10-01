import type { DirectoryFilters, DirectoryResult, PersonRecord } from './types';

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
  const matches = eligible.filter(record => {
    const tenures = record.tenures.filter(t => t.verificationStatus !== 'unverified' && !t.disputedFacts.some(fact => ['person', 'office'].includes(fact)) && record.offices.some(o => o.id === t.officeId && o.included));
    const current = (id: string) => record.rosterMemberships?.some(m => m.tenureId === id);
    const fields = [record.person.canonicalName, ...record.person.nameVariants, ...record.filings.map(f => f.filerName), ...record.offices.filter(o => tenures.some(t => t.officeId === o.id)).map(o => o.name), ...record.constituencies.filter(c => tenures.some(t => t.constituencyId === c.id)).map(c => c.name), ...record.jurisdictions.map(j => j.name)];
    return (!filters.q || fields.some(value => value.toLocaleLowerCase('en-PH').includes(filters.q.toLocaleLowerCase('en-PH')))) &&
      tenures.some(t => (!filters.office || t.officeId === filters.office) && (!filters.jurisdiction || record.jurisdictions.some(j => j.id === filters.jurisdiction)) && (!filters.tenure || (filters.tenure === 'current' ? current(t.id) : t.endDate && !current(t.id)))) &&
      (!filters.documents || (record.sourceDocuments.length > 0) === (filters.documents === 'available')) && (!filters.year || record.filings.some(f => f.reportingDate.value.startsWith(filters.year)));
  }).sort((a, b) => a.person.canonicalName.localeCompare(b.person.canonicalName) || a.person.id.localeCompare(b.person.id));
  const page = Math.min(filters.page, Math.max(1, Math.ceil(matches.length / 30)));
  return { total: matches.length, page, pageSize: 30, rows: matches.slice((page - 1) * 30, page * 30).map(record => ({ id: record.person.id, slug: record.person.slug, canonicalName: record.person.canonicalName, documentCount: new Set(record.sourceDocuments.map(d => d.sha256)).size, offices: record.offices.filter(o => o.included).map(o => o.name) })), offices: [...new Map(eligible.flatMap(r => r.offices.filter(o => o.included).map(o => [o.id, { id: o.id, name: o.name }]))).values()], jurisdictions: [...new Map(eligible.flatMap(r => r.jurisdictions.map(j => [j.id, { id: j.id, name: j.name }]))).values()] };
}
