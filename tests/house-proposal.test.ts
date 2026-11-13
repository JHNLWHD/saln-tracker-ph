import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import plan from '../data/proposals/house-2026-10-02/ticket-map.json';
import { validateReviewedManifest } from '../app/db/manifests.server';

test('House proposal preserves the dated source set in bounded independent batches without approval', async () => {
  const read = async (name: string, checksum: string) => {
    const bytes = await readFile(new URL(`../data/proposals/house-2026-10-02/${name}.tsv`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), checksum);
    const [header, ...lines] = bytes.toString('utf8').trimEnd().split('\n');
    assert.equal(header, 'sourceMemberId\tsourceName\tsourceType\tsourceConstituency');
    return lines.map(line => {
      const cells = line.split('\t'); assert.equal(cells.length, 4);
      const [id, name, type, constituency] = cells;
      assert.match(id, /^[A-Z0-9]{4}$/); assert.ok(name && constituency);
      assert.ok(type === 'District' || type === 'Party-list');
      return { id, name, type, constituency };
    });
  };
  const members = await read('members', plan.source.membersSha256);
  const inactive = await read('inactive', plan.source.inactiveSha256);
  assert.equal(plan.status, 'proposal_not_approved'); assert.equal(plan.approvalRef, null);
  assert.throws(() => validateReviewedManifest(plan));
  assert.equal(plan.asOf, plan.source.verificationDate);
  assert.equal(members.length, plan.counts.currentMembers); assert.equal(members.length, 317);
  assert.equal(new Set(members.map(row => row.id)).size, 317);
  assert.equal(members.filter(row => row.type === 'District').length, plan.counts.districtRepresentatives);
  assert.equal(members.filter(row => row.type === 'Party-list').length, plan.counts.partyListRepresentatives);
  assert.equal(inactive.length, plan.counts.inactiveExcluded); assert.equal(inactive.length, 7);
  assert.equal(new Set(inactive.map(row => row.id)).size, 7);
  assert.ok(inactive.every(row => !members.some(member => member.id === row.id)));
  assert.equal(plan.typing.District.constituencyKind, 'legislative_district');
  assert.equal(plan.typing.District.jurisdictionKind, 'legislative_district');
  assert.equal(plan.typing['Party-list'].constituencyKind, 'party_list');
  assert.equal(plan.typing['Party-list'].jurisdictionKind, 'country');
  assert.equal(plan.typing['Party-list'].jurisdictionId, 'jurisdiction-ph');
  const assigned = plan.batches.flatMap(batch => batch.sourceMemberIds);
  assert.equal(assigned.length, 317); assert.equal(new Set(assigned).size, 317);
  assert.deepEqual([...assigned].sort(), members.map(row => row.id).sort());
  const acceptance = ['evidence', 'manifest', 'profile', 'document', 'reconciliation', 'staging', 'approval'];
  assert.deepEqual(Object.keys(plan.acceptanceCriteria).sort(), [...acceptance].sort());
  const groups = new Map<string, string>();
  for (const batch of plan.batches) {
    assert.ok(batch.sourceMemberIds.length > 0 && batch.sourceMemberIds.length <= plan.limits.peoplePerBatch);
    assert.deepEqual([...batch.acceptanceCriteria].sort(), [...acceptance].sort());
    assert.ok(batch.blockedBy.includes('#66') && !batch.blockedBy.includes('#68') && batch.blockedBy.includes('HOUSE-00'));
    for (const id of batch.sourceMemberIds) {
      const member = members.find(row => row.id === id); assert.ok(member);
      assert.equal(member.type, batch.sourceType);
      const group = member.type === 'District' ? member.constituency.slice(0, member.constituency.lastIndexOf(', ')) : member.constituency;
      assert.ok(batch.groups.includes(group));
      const key = `${member.type}:${group}`;
      assert.ok(!groups.has(key) || groups.get(key) === batch.id, `Split source group: ${key}`);
      groups.set(key, batch.id);
    }
  }
  const tickets = [plan.foundation, ...plan.batches, ...plan.integrationTickets];
  assert.equal(tickets.length, 33); assert.equal(new Set(tickets.map(ticket => ticket.id)).size, 33);
  const visited = new Set<string>();
  const visit = (id: string, path: string[] = []) => {
    assert.ok(!path.includes(id), `Cyclic House dependency: ${[...path, id].join(' → ')}`);
    if (id === '#66' || visited.has(id)) return;
    const ticket = tickets.find(ticket => ticket.id === id); assert.ok(ticket, `Unknown dependency: ${id}`);
    for (const dependency of ticket.blockedBy) visit(dependency, [...path, id]);
    visited.add(id);
  };
  tickets.forEach(ticket => visit(ticket.id));
  assert.equal(members.find(row => row.id === 'L042')?.constituency, 'Iloilo City, 2nd District');
  assert.ok(plan.reviewFlags.some(flag => flag.sourceMemberIds.includes('L042') && flag.status === 'unresolved'));
  const reuse = plan.existingIdentityReuse.find(match => match.sourceMemberId === 'D027'); assert.ok(reuse);
  const reviewed = JSON.parse(await readFile(new URL(`../${reuse.evidenceManifest}`, import.meta.url), 'utf8'));
  assert.equal(reuse.personId, reviewed.payload.person.id);
  assert.ok(reviewed.payload.tenures.some((tenure: { id: string }) => tenure.id === reuse.tenureId));
  const exception = plan.typing.District.existingMappingExceptions.find(row => row.sourceMemberId === reuse.sourceMemberId); assert.ok(exception);
  const constituency = reviewed.payload.constituencies.find((row: { id: string }) => row.id === reuse.constituencyId); assert.ok(constituency);
  const jurisdiction = reviewed.payload.jurisdictions.find((row: { id: string }) => row.id === constituency.jurisdictionId); assert.ok(jurisdiction);
  assert.equal(exception.constituencyId, constituency.id); assert.equal(exception.jurisdictionId, jurisdiction.id); assert.equal(exception.jurisdictionKind, jurisdiction.kind);
  assert.notEqual(members.find(row => row.id === 'D027')?.name, members.find(row => row.id === 'J027')?.name);
});

/** Independent oracle for the work order documented in ops/house-rollout.md. */
function assertHouseStages(candidate: typeof plan) {
  assert.equal(candidate.limits.peoplePerBatch, 12);
  assert.equal(candidate.limits.initialFilingsPerBatch, 12);
  assert.equal(candidate.limits.sourceDocumentsPerBatch, 12);
  assert.equal(candidate.limits.fullItemization, 'deferred');
  const district = Array.from({ length: 23 }, (_, i) => `HOUSE-D${String(i + 1).padStart(2, '0')}`);
  const partyList = Array.from({ length: 6 }, (_, i) => `HOUSE-P${String(i + 1).padStart(2, '0')}`);
  assert.deepEqual(candidate.batches.filter(batch => batch.sourceType === 'District').map(batch => batch.id).sort(), district);
  assert.deepEqual(candidate.batches.filter(batch => batch.sourceType === 'Party-list').map(batch => batch.id).sort(), partyList);
  const tickets = [candidate.foundation, ...candidate.batches, ...candidate.integrationTickets];
  assert.ok(tickets.every(ticket => !ticket.blockedBy.includes('#68')), 'The parent tracker must not block the work needed to complete it');
  // This models native dependencies only, after separate map approval permits
  // issue publication. It does not set approvalRef or approve this proposal.
  const accepted = new Set<string>();
  const expectReady = (ids: string[]) => assert.deepEqual(tickets.filter(ticket => !accepted.has(ticket.id) && ticket.blockedBy.every(id => accepted.has(id))).map(ticket => ticket.id).sort(), [...ids].sort(), 'House rollout frontier differs from the agreed work order');
  expectReady([]);
  accepted.add('#66'); expectReady(['HOUSE-00']);
  accepted.add('HOUSE-00'); expectReady(['HOUSE-D01']);
  accepted.add('HOUSE-D01'); expectReady(district.slice(1));
  for (const id of district.slice(1, -1)) accepted.add(id);
  expectReady(['HOUSE-D23']);
  accepted.add('HOUSE-D23'); expectReady(['HOUSE-D-ACCEPT']);
  accepted.add('HOUSE-D-ACCEPT'); expectReady(['HOUSE-P01']);
  accepted.add('HOUSE-P01'); expectReady(partyList.slice(1));
  for (const id of partyList.slice(1, -1)) accepted.add(id);
  expectReady(['HOUSE-P06']);
  accepted.add('HOUSE-P06'); expectReady(['HOUSE-P-ACCEPT']);
  accepted.add('HOUSE-P-ACCEPT'); expectReady(['HOUSE-FINAL']);
  accepted.add('HOUSE-FINAL'); expectReady([]);
}

test('House map separates parent approval from native blockers and preserves the bounded rollout stages', () => {
  assert.equal(plan.status, 'proposal_not_approved'); assert.equal(plan.approvalRef, null);
  assertHouseStages(plan);
});

test('House stage checks reject omitted pilot, reconciliation and final approval dependencies', () => {
  assert.doesNotThrow(() => assertHouseStages(plan));
  for (const [ticketId, dependency] of [
    ['HOUSE-D02', 'HOUSE-D01'], ['HOUSE-P02', 'HOUSE-P01'],
    ['HOUSE-P01', 'HOUSE-D-ACCEPT'], ['HOUSE-D-ACCEPT', 'HOUSE-D23'],
    ['HOUSE-P-ACCEPT', 'HOUSE-P06'], ['HOUSE-FINAL', 'HOUSE-P-ACCEPT'],
  ]) {
    const changed = structuredClone(plan);
    const ticket = [changed.foundation, ...changed.batches, ...changed.integrationTickets].find(row => row.id === ticketId); assert.ok(ticket);
    ticket.blockedBy = ticket.blockedBy.filter(id => id !== dependency);
    assert.throws(() => assertHouseStages(changed), /House rollout frontier/);
  }
  for (const key of ['peoplePerBatch', 'initialFilingsPerBatch', 'sourceDocumentsPerBatch'] as const) {
    const changed = structuredClone(plan); changed.limits[key] = 13;
    assert.throws(() => assertHouseStages(changed));
  }
});
