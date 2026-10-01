import { sql } from "drizzle-orm";
import * as schema from "./schema";
import { canonicalPersonId } from "./identities.server";

function effectiveTenureField(field: "verificationStatus" | "disputedFacts") {
  const original = field === "verificationStatus" ? schema.tenures.verificationStatus : schema.tenures.disputedFacts;
  const path = `$.${field}`;
  return sql`coalesce((select json_extract(${schema.editorialCorrections.changes}, ${path})
    from ${schema.editorialCorrections}
    where ${schema.editorialCorrections.targetType} = 'tenure' and ${schema.editorialCorrections.targetId} = ${schema.tenures.id}
      and json_type(${schema.editorialCorrections.changes}, ${path}) is not null
    order by ${schema.editorialCorrections.revision} desc limit 1), ${original})`;
}

/** Correlated with the outer People row; used for directories, imports, and document access. */
export function personIsEligible() {
  return sql`not exists (select 1 from ${schema.identityMatches} where ${schema.identityMatches.fromPersonId} = ${schema.people.id}) and exists (
    select 1 from ${schema.tenures}
    inner join ${schema.offices} on ${schema.offices.id} = ${schema.tenures.officeId}
    where ${canonicalPersonId(schema.tenures.personId)} = ${schema.people.id}
      and ${schema.offices.included} = 1 and ${schema.offices.kind} = 'elected'
      and ${tenureIsVerified()}
  )`;
}

/** Correlated with the selected Tenure, including corrected evidence. */
export function tenureIsVerified() {
  return sql`${effectiveTenureField("verificationStatus")} != 'unverified'
      and not exists (select 1 from json_each(${effectiveTenureField("disputedFacts")}) where value in ('person','office'))
      and (exists (select 1 from ${schema.tenureCitations}
        inner join ${schema.citations} on ${schema.citations.id} = ${schema.tenureCitations.citationId}
        where ${schema.tenureCitations.tenureId} = ${schema.tenures.id}
          and exists (select 1 from json_each(${schema.tenureCitations.supports}) where value = 'person')
          and exists (select 1 from json_each(${schema.tenureCitations.supports}) where value = 'office'))
        or exists (select 1 from ${schema.editorialCorrections}, json_each(${schema.editorialCorrections.citations}) source
          where ${schema.editorialCorrections.targetType} = 'tenure' and ${schema.editorialCorrections.targetId} = ${schema.tenures.id}
            and exists (select 1 from json_each(source.value, '$.supports') where value = 'person')
            and exists (select 1 from json_each(source.value, '$.supports') where value = 'office')))
  `;
}
