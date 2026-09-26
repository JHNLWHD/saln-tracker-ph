import { sql } from "drizzle-orm";
import * as schema from "./schema";

/** Correlated with the outer People row; used for directories, imports, and document access. */
export function personIsEligible() {
  return sql`exists (
    select 1 from ${schema.tenures}
    inner join ${schema.offices} on ${schema.offices.id} = ${schema.tenures.officeId}
    inner join ${schema.tenureCitations} on ${schema.tenureCitations.tenureId} = ${schema.tenures.id}
    inner join ${schema.citations} on ${schema.citations.id} = ${schema.tenureCitations.citationId}
    where ${schema.tenures.personId} = ${schema.people.id}
      and ${schema.offices.included} = 1 and ${schema.offices.kind} = 'elected'
      and ${schema.tenures.verificationStatus} != 'unverified'
      and not exists (select 1 from json_each(${schema.tenures.disputedFacts}) where value in ('person','office'))
      and exists (select 1 from json_each(${schema.tenureCitations.supports}) where value = 'person')
      and exists (select 1 from json_each(${schema.tenureCitations.supports}) where value = 'office')
  )`;
}
