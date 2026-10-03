import { and, count, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { DirectoryFilters, DirectoryResult } from '../archive/types';
import { searchText } from '../archive/directory';
import type { ArchiveReader } from './client.server';
import { canonicalPersonId } from './identities.server';
import { personIsEligible, tenureIsVerified } from './eligibility';
import { effectiveField, isLatestRosterSnapshot, tenureCoversRosterDate } from './rosters.server';
import * as s from './schema';

const anyTenure = (condition: SQL = sql`1`) => sql`exists (select 1 from ${s.tenures} inner join ${s.offices} on ${s.offices.id} = ${s.tenures.officeId}
  left join ${s.constituencies} on ${s.constituencies.id} = ${s.tenures.constituencyId}
  where ${canonicalPersonId(s.tenures.personId)} = ${s.people.id} and ${s.offices.included} = 1 and ${tenureIsVerified()} and ${condition})`;
const currentTenure = sql`exists (select 1 from ${s.rosterMembers} inner join ${s.rosterSnapshots} on ${s.rosterSnapshots.id} = ${s.rosterMembers.snapshotId}
  where ${s.rosterMembers.tenureId} = ${s.tenures.id} and ${tenureCoversRosterDate(s.rosterSnapshots.verifiedAsOf)} and ${isLatestRosterSnapshot()})`;
const hasDocuments = sql`exists (select 1 from ${s.filings} inner join ${s.sourceDocuments} on ${s.sourceDocuments.filingId} = ${s.filings.id} where ${canonicalPersonId(s.filings.personId)} = ${s.people.id})`;

export async function readDirectory(tx: ArchiveReader, filters: DirectoryFilters): Promise<DirectoryResult> {
  const conditions: SQL[] = [personIsEligible()];
  const selectedTenure = [];
  if (filters.office) selectedTenure.push(eq(s.offices.id, filters.office));
  if (filters.jurisdiction) selectedTenure.push(sql`(${s.offices.jurisdictionId} in (with recursive descendants(id) as (select ${filters.jurisdiction} union select r.from_id from jurisdiction_relationships r join descendants d on r.to_id = d.id) select id from descendants)
    or ${s.constituencies.jurisdictionId} in (with recursive descendants(id) as (select ${filters.jurisdiction} union select r.from_id from jurisdiction_relationships r join descendants d on r.to_id = d.id) select id from descendants))`);
  if (filters.tenure === 'current') selectedTenure.push(currentTenure);
  if (filters.tenure === 'former') selectedTenure.push(sql`json_extract(${effectiveField('tenure', s.tenures.id, 'endDate', sql`json_object('value', ${s.tenures.endDate})`)}, '$.value') is not null and not ${currentTenure}`);
  if (selectedTenure.length) conditions.push(anyTenure(and(...selectedTenure)));
  if (filters.documents) conditions.push(filters.documents === 'available' ? hasDocuments : sql`not ${hasDocuments}`);
  if (filters.year) conditions.push(sql`exists (select 1 from ${s.filings} where ${canonicalPersonId(s.filings.personId)} = ${s.people.id} and substr(${effectiveField('filing', s.filings.id, 'reportingDate.value', s.filings.reportingDate)}, 1, 4) = ${filters.year})`);
  if (filters.q) {
    const identityId = sql`identity.id`;
    const variants = effectiveField('person', identityId, 'nameVariants', sql`(select coalesce(json_group_array(value), '[]') from person_names where person_id = identity.id)`);
    // ponytail: fold only approved name fields in the server; use a Unicode FTS index when this bounded-field scan becomes too large.
    const fields = sql`json_array(
      (select json_group_array(json_array(${effectiveField('person', identityId, 'canonicalName', sql`identity.canonical_name`)},
        case when identity.id != ${s.people.id} then identity.canonical_name end, json(${variants}))) from people identity where ${canonicalPersonId(identityId)} = ${s.people.id}),
      (select json_group_array(${effectiveField('filing', s.filings.id, 'filerName', s.filings.filerName)}) from ${s.filings} where ${canonicalPersonId(s.filings.personId)} = ${s.people.id}),
      (select json_group_array(json_array(${s.offices.name}, ${s.constituencies.name},
        (select json_group_array(${s.jurisdictions.name}) from ${s.jurisdictions} where ${s.jurisdictions.id} in (${s.offices.jurisdictionId}, ${s.constituencies.jurisdictionId}))))
        from ${s.tenures} inner join ${s.offices} on ${s.offices.id} = ${s.tenures.officeId} left join ${s.constituencies} on ${s.constituencies.id} = ${s.tenures.constituencyId}
        where ${canonicalPersonId(s.tenures.personId)} = ${s.people.id} and ${s.offices.included} = 1 and ${tenureIsVerified()}))`;
    // Keep table qualifiers inside these correlated subqueries when Drizzle builds a single-table selection.
    const candidates = await tx.select({ id: s.people.id, fields: sql<string>`${fields}` }).from(s.people).where(and(...conditions));
    const query = searchText(filters.q);
    const ids = candidates.filter(row => JSON.parse(row.fields).flat(Infinity).some((value: unknown) => typeof value === 'string' && searchText(value).includes(query))).map(row => row.id);
    conditions.push(sql`${s.people.id} in (select value from json_each(${JSON.stringify(ids)}))`);
  }
  const where = and(...conditions), [totals] = await tx.select({ total: count() }).from(s.people).where(where);
  const total = totals.total, pageSize = 30, page = Math.min(filters.page, Math.max(1, Math.ceil(total / pageSize)));
  const name = effectiveField<string>('person', sql`people.id`, 'canonicalName', sql`people.canonical_name`);
  const rows = await tx.select({ id: s.people.id, slug: s.people.slug, canonicalName: name,
    documentCount: sql<number>`(select count(distinct d.sha256) from source_documents d inner join filings f on f.id = d.filing_id where ${canonicalPersonId(sql`f.person_id`)} = people.id)`.mapWith(Number),
  }).from(s.people).where(where).orderBy(name, s.people.id).limit(pageSize).offset((page - 1) * pageSize);
  const offices = await tx.select({ id: s.offices.id, name: s.offices.name }).from(s.offices).innerJoin(s.tenures, eq(s.tenures.officeId, s.offices.id)).innerJoin(s.people, eq(s.people.id, canonicalPersonId(s.tenures.personId)))
    .where(and(personIsEligible(), tenureIsVerified(), eq(s.offices.included, true))).groupBy(s.offices.id).orderBy(s.offices.name, s.offices.id);
  const publicJurisdictionIds = sql`with recursive public_places(id) as (
    select place.value from ${s.tenures} inner join ${s.offices} on ${s.offices.id} = ${s.tenures.officeId}
      inner join ${s.people} on ${s.people.id} = ${canonicalPersonId(s.tenures.personId)}
      left join ${s.constituencies} on ${s.constituencies.id} = ${s.tenures.constituencyId}
      inner join json_each(json_array(${s.offices.jurisdictionId}, ${s.constituencies.jurisdictionId})) place
      where ${personIsEligible()} and ${tenureIsVerified()} and ${s.offices.included} = 1 and place.value is not null
    union select ${s.jurisdictionRelationships.toId} from ${s.jurisdictionRelationships}
      inner join public_places on ${s.jurisdictionRelationships.fromId} = public_places.id
  ) select id from public_places`;
  const jurisdictions = await tx.select({ id: s.jurisdictions.id, name: s.jurisdictions.name }).from(s.jurisdictions)
    .where(sql`${s.jurisdictions.id} in (${publicJurisdictionIds})`).orderBy(s.jurisdictions.name, s.jurisdictions.id);
  const memberships = await tx.select({ personId: canonicalPersonId(s.tenures.personId).as('person_id'), name: s.offices.name }).from(s.tenures).innerJoin(s.offices, eq(s.offices.id, s.tenures.officeId))
    .where(and(inArray(canonicalPersonId(s.tenures.personId), rows.map(row => row.id)), tenureIsVerified(), eq(s.offices.included, true))).groupBy(canonicalPersonId(s.tenures.personId), s.offices.name).orderBy(s.offices.name);
  return { rows: rows.map(row => ({ ...row, offices: memberships.filter(member => member.personId === row.id).map(member => member.name) })), total, page, pageSize, offices, jurisdictions };
}
