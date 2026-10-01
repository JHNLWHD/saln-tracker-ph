import { and, count, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { DirectoryFilters, DirectoryResult } from '../archive/types';
import type { ArchiveReader } from './client.server';
import { canonicalPersonId } from './identities.server';
import { personIsEligible, tenureIsVerified } from './eligibility';
import { effectiveField, tenureCoversRosterDate } from './rosters.server';
import * as s from './schema';

const anyTenure = (condition: SQL = sql`1`) => sql`exists (select 1 from ${s.tenures} inner join ${s.offices} on ${s.offices.id} = ${s.tenures.officeId}
  left join ${s.constituencies} on ${s.constituencies.id} = ${s.tenures.constituencyId}
  where ${canonicalPersonId(s.tenures.personId)} = ${s.people.id} and ${s.offices.included} = 1 and ${tenureIsVerified()} and ${condition})`;
const currentTenure = sql`exists (select 1 from ${s.rosterMembers} inner join ${s.rosterSnapshots} on ${s.rosterSnapshots.id} = ${s.rosterMembers.snapshotId}
  where ${s.rosterMembers.tenureId} = ${s.tenures.id} and ${tenureCoversRosterDate(s.rosterSnapshots.verifiedAsOf)} and not exists (select 1 from roster_snapshots newer where newer.scope = ${s.rosterSnapshots.scope}
  and (newer.verified_as_of > ${s.rosterSnapshots.verifiedAsOf} or (newer.verified_as_of = ${s.rosterSnapshots.verifiedAsOf} and newer.id < ${s.rosterSnapshots.id}))))`;
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
    const pattern = `%${filters.q.replace(/[\\%_]/g, value => `\\${value}`)}%`;
    const match = (field: SQL) => sql`${field} like ${pattern} escape char(92)`;
    const identityId = sql`identity.id`;
    const variants = effectiveField('person', identityId, 'nameVariants', sql`(select coalesce(json_group_array(value), '[]') from person_names where person_id = identity.id)`);
    conditions.push(sql`(exists (select 1 from people identity where ${canonicalPersonId(identityId)} = ${s.people.id} and
      (${match(effectiveField('person', identityId, 'canonicalName', sql`identity.canonical_name`))}
        or (identity.id != ${s.people.id} and ${match(sql`identity.canonical_name`)})
        or exists (select 1 from json_each(${variants}) names where ${match(sql`names.value`)})))
      or exists (select 1 from ${s.filings} where ${canonicalPersonId(s.filings.personId)} = ${s.people.id} and ${match(effectiveField('filing', s.filings.id, 'filerName', s.filings.filerName))})
      or ${anyTenure(sql`(${match(sql`${s.offices.name}`)} or ${match(sql`${s.constituencies.name}`)} or exists (select 1 from ${s.jurisdictions} where ${s.jurisdictions.id} in (${s.offices.jurisdictionId}, ${s.constituencies.jurisdictionId}) and ${match(sql`${s.jurisdictions.name}`)}))`)})`);
  }
  // ponytail: substring matching scans reviewed name values; native indexes serve evidence and field joins. Add FTS when measured nationwide search latency requires it.
  const where = and(...conditions), [totals] = await tx.select({ total: count() }).from(s.people).where(where);
  const total = totals.total, pageSize = 30, page = Math.min(filters.page, Math.max(1, Math.ceil(total / pageSize)));
  const name = effectiveField<string>('person', sql`people.id`, 'canonicalName', sql`people.canonical_name`);
  const rows = await tx.select({ id: s.people.id, slug: s.people.slug, canonicalName: name,
    documentCount: sql<number>`(select count(distinct d.sha256) from source_documents d inner join filings f on f.id = d.filing_id where ${canonicalPersonId(sql`f.person_id`)} = people.id)`.mapWith(Number),
  }).from(s.people).where(where).orderBy(name, s.people.id).limit(pageSize).offset((page - 1) * pageSize);
  const offices = await tx.select({ id: s.offices.id, name: s.offices.name }).from(s.offices).innerJoin(s.tenures, eq(s.tenures.officeId, s.offices.id)).innerJoin(s.people, eq(s.people.id, canonicalPersonId(s.tenures.personId)))
    .where(and(personIsEligible(), tenureIsVerified(), eq(s.offices.included, true))).groupBy(s.offices.id).orderBy(s.offices.name, s.offices.id);
  const jurisdictions = await tx.select({ id: s.jurisdictions.id, name: s.jurisdictions.name }).from(s.jurisdictions).orderBy(s.jurisdictions.name, s.jurisdictions.id);
  const memberships = await tx.select({ personId: canonicalPersonId(s.tenures.personId).as('person_id'), name: s.offices.name }).from(s.tenures).innerJoin(s.offices, eq(s.offices.id, s.tenures.officeId))
    .where(and(inArray(canonicalPersonId(s.tenures.personId), rows.map(row => row.id)), tenureIsVerified(), eq(s.offices.included, true))).groupBy(canonicalPersonId(s.tenures.personId), s.offices.name).orderBy(s.offices.name);
  return { rows: rows.map(row => ({ ...row, offices: memberships.filter(member => member.personId === row.id).map(member => member.name) })), total, page, pageSize, offices, jurisdictions };
}
