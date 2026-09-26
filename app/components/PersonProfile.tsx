import { useId } from 'react';
import type { PartialDate, PersonRecord, Tenure } from '../archive/types';
import { EmptyState } from './ui/Archive';

const assumptionLabels: Record<Tenure['assumptionMethod'], string> = {
  election: 'Election',
  succession: 'Succession',
  substitution: 'Substitution',
  vacancy_appointment: 'Appointment to a vacancy',
  chamber_selection: 'Selection within the chamber',
  unknown: 'Not established',
};

function EvidenceDate({ date }: { date: PartialDate | null }) {
  if (!date) return <>Not established</>;
  return <>{date.precision === 'year' ? <span>{date.value}</span> : <time dateTime={date.value}>{date.value}</time>} <span className="archive-muted">({date.precision} precision)</span></>;
}

export function PersonProfile({ record }: { record: PersonRecord }) {
  const { person } = record;
  const id = useId();
  const includedTenures = record.tenures.flatMap(tenure => {
    const office = record.offices.find(office => office.id === tenure.officeId && office.included);
    return office ? [{ tenure, office }] : [];
  });

  return (
    <article className="space-y-8">
      <header className="space-y-3 border-b border-gray-300 pb-6">
        <p className="archive-label">Person</p>
        <h1>{person.canonicalName}</h1>
        {person.nameVariants.length > 0 && (
          <div>
            <h2 className="text-lg">Name Variants</h2>
            <ul className="list-disc pl-5">{person.nameVariants.map(name => <li key={name}>{name}</li>)}</ul>
          </div>
        )}
      </header>

      {person.eligibility !== 'eligible' && (
        <aside className="border-l-4 border-gray-500 bg-white p-4" aria-labelledby={`${id}-scope`}>
          <h2 id={`${id}-scope`} className="text-xl">{person.eligibility === 'disputed' ? 'Archive eligibility is disputed' : 'Archive eligibility is not verified'}</h2>
          <p>This legacy profile remains available for link continuity. This Person is excluded from public directories, search, and coverage counts until eligibility is established through a Verified Tenure in an included Elected Office.</p>
        </aside>
      )}

      <section aria-labelledby={`${id}-tenures`} className="space-y-4">
        <h2 id={`${id}-tenures`}>Public office and evidence</h2>
        {includedTenures.length === 0 && <p>No Tenure in an included Office has been established for this profile.</p>}
        {includedTenures.map(({ tenure, office }) => {
          const constituency = record.constituencies.find(item => item.id === tenure.constituencyId);
          const jurisdiction = record.jurisdictions.find(item => item.id === office.jurisdictionId);
          return (
            <section key={tenure.id} aria-labelledby={`${id}-${tenure.id}`} className="space-y-3 border-b border-gray-300 pb-6">
              <h3 id={`${id}-${tenure.id}`}>{office.name}</h3>
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
                <dt className="font-semibold">Verification</dt><dd>{tenure.verificationStatus === 'verified' ? 'Verified Tenure' : tenure.verificationStatus === 'disputed' ? 'Disputed Tenure' : 'Unverified Tenure'}</dd>
                <dt className="font-semibold">Start date</dt><dd><EvidenceDate date={tenure.startDate} /></dd>
                <dt className="font-semibold">End date</dt><dd><EvidenceDate date={tenure.endDate} /></dd>
                <dt className="font-semibold">Assumption Method</dt><dd>{assumptionLabels[tenure.assumptionMethod]}</dd>
                {constituency && <><dt className="font-semibold">Constituency</dt><dd>{constituency.name}</dd></>}
                {jurisdiction && <><dt className="font-semibold">Jurisdiction</dt><dd>{jurisdiction.name}</dd></>}
              </dl>
              {tenure.disputedFacts.length > 0 && (
                <div>
                  <p className="font-semibold">Disputed Facts</p>
                  <ul className="list-disc pl-5">{tenure.disputedFacts.map(fact => <li key={fact}>{fact}</li>)}</ul>
                </div>
              )}
              <div>
                <p className="font-semibold">Evidence citations</p>
                {tenure.citations.length === 0 ? <p className="archive-muted">No attributable citation is recorded.</p> : (
                  <ul className="space-y-3">
                    {tenure.citations.map(citation => (
                      <li key={citation.id} className="text-sm break-words">
                        <a href={citation.url} className="text-primary-700 underline">{citation.title}</a>
                        <p>{citation.publisher} · {citation.type === 'official_record' ? 'Official record' : 'Public article'}</p>
                        <p>Published: <EvidenceDate date={citation.publishedDate} /></p>
                        {citation.supports.length > 0 && <p>Supports: {citation.supports.join(', ')}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          );
        })}
      </section>

      {record.sourceDocuments.length === 0 ? (
        <EmptyState>
          <p>The project has not acquired a Source Document for this Person. This does not establish that the Person failed to file a SALN.</p>
        </EmptyState>
      ) : (
        <p>{record.sourceDocuments.length} {record.sourceDocuments.length === 1 ? 'Source Document is' : 'Source Documents are'} in the Archive.</p>
      )}
    </article>
  );
}
