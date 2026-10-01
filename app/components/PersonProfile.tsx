import { useId } from 'react';
import type { Citation, CorrectionChanges, CorrectionTargetType, PartialDate, PersonRecord, SourceDocument, Tenure } from '../archive/types';
import { ArchiveTable, EmptyState } from './ui/Archive';

const assumptionLabels: Record<Tenure['assumptionMethod'], string> = {
  election: 'Election',
  succession: 'Succession',
  substitution: 'Substitution',
  vacancy_appointment: 'Appointment to a vacancy',
  chamber_selection: 'Selection within the chamber',
  unknown: 'Not established',
};

const factLabels: Record<string, string> = {
  person: 'Person',
  identity: 'Identity Match',
  office: 'Office',
  startDate: 'Start date',
  endDate: 'End date',
  assumptionMethod: 'Assumption Method',
  canonicalName: 'Canonical Name',
  nameVariants: 'Name Variants',
  verificationStatus: 'Verification',
  disputedFacts: 'Disputed Facts',
  filerName: 'Filer Name',
  reportingDate: 'Reporting Date',
  executionDate: 'Execution Date',
  receiptDate: 'Receipt Date',
  fileName: 'File name',
  originalUrl: 'Original source URL',
  provenanceType: 'Provenance type',
  provenanceNote: 'Provenance note',
  officialReleaseDate: 'Official Release Date',
  acquisitionDate: 'Acquisition Date',
  archivePublicationDate: 'Archive Publication Date',
};

const provenanceLabels: Record<SourceDocument['provenanceType'], string> = {
  official_download: 'Official download',
  formal_release: 'Formally released copy',
  preserved_copy: 'Preserved Copy',
};

const transcriptionLabels: Record<SourceDocument['transcriptionLevel'], string> = {
  document_only: 'Document only',
  summary_totals: 'Summary totals',
  full_itemization: 'Full itemization',
};

function EvidenceDate({ date }: { date: PartialDate | null }) {
  if (!date) return <>Not established</>;
  return <>{date.precision === 'year' ? <span>{date.value}</span> : <time dateTime={date.value}>{date.value}</time>} <span className="archive-muted">({date.precision} precision)</span></>;
}

function EvidenceCitations({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return <p className="archive-muted">No attributable citation is recorded.</p>;
  return (
    <ul className="space-y-3">
      {citations.map(citation => (
        <li key={citation.id} className="text-sm break-words">
          <a href={citation.url} className="text-primary-700 underline">{citation.title}</a>
          <p>{citation.publisher} · {citation.type === 'official_record' ? 'Official record' : 'Public article'}</p>
          <p>Published: <EvidenceDate date={citation.publishedDate} /></p>
          {citation.supports.length > 0 && <p>Supports: {citation.supports.map(fact => factLabels[fact] ?? fact).join(', ')}</p>}
        </li>
      ))}
    </ul>
  );
}

function CorrectionValue({ field, value }: { field: string; value: CorrectionChanges[keyof CorrectionChanges] }) {
  if (value == null) return <>Not established</>;
  if (Array.isArray(value)) return <>{value.length ? value.map(item => field === 'disputedFacts' ? factLabels[item] ?? item : item).join(', ') : 'None recorded'}</>;
  if (typeof value === 'object') return <EvidenceDate date={value} />;
  const labels: Record<string, Record<string, string>> = {
    assumptionMethod: assumptionLabels,
    provenanceType: provenanceLabels,
    verificationStatus: { verified: 'Verified', unverified: 'Unverified', disputed: 'Disputed' },
  };
  return <>{labels[field]?.[value] ?? value}</>;
}

const correctionTargetLabels: Record<CorrectionTargetType, string> = {
  person: 'Person metadata', tenure: 'Tenure evidence', filing: 'Filing metadata', source_document: 'Source Document metadata',
};

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
          <p>This profile remains available for link continuity. This Person is excluded from public directories, search, and coverage counts until eligibility is established through a Verified Tenure in an included Elected Office.</p>
        </aside>
      )}

      <section aria-labelledby={`${id}-filings`} className="space-y-6">
        <h2 id={`${id}-filings`}>SALN Filings</h2>
        {record.sourceDocuments.length === 0 && person.eligibility !== 'eligible' && (
          <p>Source Documents are not shown while Archive eligibility is unresolved. This does not establish that the Person failed to file a SALN.</p>
        )}
        {record.sourceDocuments.length === 0 && person.eligibility === 'eligible' && (
          <EmptyState>
            <p>The project has not acquired a Source Document for this Person. This does not establish that the Person failed to file a SALN.</p>
          </EmptyState>
        )}
        {record.filings.map(filing => {
          const documents = record.sourceDocuments.filter(document => document.filingId === filing.id);
          const hasReviewedTotals = record.financialSummaries.some(summary => summary.filingId === filing.id);
          return (
            <section key={filing.id} aria-labelledby={`${id}-filing-${filing.id}`} className="space-y-4 border-b border-gray-300 pb-6">
              <div>
                <p className="archive-label">Filing</p>
                <h3 id={`${id}-filing-${filing.id}`}>Reporting Date: <EvidenceDate date={filing.reportingDate} /></h3>
              </div>
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
                <dt className="font-semibold">Filer Name</dt><dd>{filing.filerName}</dd>
                <dt className="font-semibold">Execution Date</dt><dd><EvidenceDate date={filing.executionDate} /></dd>
                <dt className="font-semibold">Receipt Date</dt><dd><EvidenceDate date={filing.receiptDate} /></dd>
              </dl>
              {!hasReviewedTotals && <p className="archive-muted">No reviewed summary totals are available for this Filing. Inspect the Source Document for the declared information.</p>}
              {documents.length === 0 ? <p>No Source Document is currently in the archive for this Filing.</p> : (
                <ArchiveTable caption={`Source Documents for ${filing.filerName} (${filing.reportingDate.value})`}>
                  <thead><tr><th scope="col">Source Document</th><th scope="col">Provenance</th><th scope="col">Transcription Level</th><th scope="col">Actions</th></tr></thead>
                  <tbody>
                    {documents.map(document => {
                      const href = `/documents/${document.sha256}`;
                      return (
                        <tr key={document.id}>
                          <td className="min-w-[12rem]">
                            <p className="font-semibold break-words">{document.fileName}</p>
                            <p className="archive-muted">{document.mediaType} · {document.byteSize.toLocaleString('en-PH')} bytes</p>
                          </td>
                          <td className="min-w-[18rem] space-y-2">
                            <p className="font-semibold">{provenanceLabels[document.provenanceType]}</p>
                            <p>{document.provenanceNote}</p>
                            {document.originalUrl && <a className="text-primary-700 underline" href={document.originalUrl}>Original source<span className="sr-only"> for {document.fileName}</span></a>}
                            <dl className="space-y-1">
                              <div><dt className="font-semibold">Official Release Date</dt><dd><EvidenceDate date={document.officialReleaseDate} /></dd></div>
                              <div><dt className="font-semibold">Acquisition Date</dt><dd><EvidenceDate date={document.acquisitionDate} /></dd></div>
                              <div><dt className="font-semibold">Archive Publication Date</dt><dd><time dateTime={document.archivePublicationDate}>{document.archivePublicationDate}</time></dd></div>
                            </dl>
                          </td>
                          <td>{transcriptionLabels[document.transcriptionLevel]}</td>
                          <td>
                            <div className="flex flex-col items-start gap-3">
                              <a className="text-primary-700 underline" href={href}>Open<span className="sr-only"> {document.fileName}</span></a>
                              <a className="text-primary-700 underline" href={`${href}?download=1`} download={document.fileName}>Download<span className="sr-only"> {document.fileName}</span></a>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </ArchiveTable>
              )}
            </section>
          );
        })}
      </section>

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
                  <ul className="list-disc pl-5">{tenure.disputedFacts.map(fact => <li key={fact}>{factLabels[fact] ?? fact}</li>)}</ul>
                </div>
              )}
              <div>
                <p className="font-semibold">Evidence citations</p>
                <EvidenceCitations citations={tenure.citations} />
              </div>
            </section>
          );
        })}
      </section>

      {(record.identityMatches?.length ?? 0) > 0 && (
        <section aria-labelledby={`${id}-identities`} className="space-y-4">
          <h2 id={`${id}-identities`}>Identity Matches</h2>
          <p>Reviewed matches preserve former profile links. Filings and Source Documents remain unchanged.</p>
          <ul className="space-y-6">
            {record.identityMatches?.map(match => (
              <li key={match.id} className="space-y-3 border-b border-gray-300 pb-6">
                <p>{match.reason}</p>
                <p className="text-sm archive-muted">Reviewed <time dateTime={match.reviewedAt}>{match.reviewedAt}</time></p>
                <EvidenceCitations citations={match.citations} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {(record.editorialCorrections?.length ?? 0) > 0 && (
        <section aria-labelledby={`${id}-corrections`} className="space-y-4">
          <h2 id={`${id}-corrections`}>Editorial Corrections</h2>
          <p>This page uses the latest reviewed metadata. Earlier values and reasons are retained below. Source Documents remain unchanged.</p>
          <ol className="space-y-6">
            {record.editorialCorrections?.map(correction => (
              <li key={correction.id} className="space-y-3 border-b border-gray-300 pb-6">
                <h3>{correctionTargetLabels[correction.target.type]} · Correction {correction.revision}</h3>
                <p className="text-sm archive-muted break-words">Reviewed <time dateTime={correction.reviewedAt}>{correction.reviewedAt}</time> · {correction.id}</p>
                <p className="text-sm archive-muted break-words">Record: {correction.target.id}</p>
                <p><span className="font-semibold">Reason: </span>{correction.reason}</p>
                <dl className="space-y-3 text-sm">
                  {Object.entries(correction.changes).map(([field, value]) => (
                    <div key={field}>
                      <dt className="font-semibold">{factLabels[field] ?? field}</dt>
                      <dd>Previously: <CorrectionValue field={field} value={correction.previousValues[field as keyof CorrectionChanges]} /></dd>
                      <dd>Corrected: <CorrectionValue field={field} value={value} /></dd>
                    </div>
                  ))}
                </dl>
                <EvidenceCitations citations={correction.citations} />
              </li>
            ))}
          </ol>
        </section>
      )}
    </article>
  );
}
