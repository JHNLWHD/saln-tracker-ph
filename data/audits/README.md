# Legacy migration audit

This audit is separate from the canonical Archive and the Public Data Snapshot. It preserves inputs for review. It does not import Filings, Tenures, financial amounts or source custody.

## Capture

Run `npm run archive:capture-legacy` with Application Default Credentials that can read Firestore in `saln-tracker-ph`. This exports the complete current document tree in the default database at one fixed read time. The existing Firebase Admin client iterates all collection and document pages, including subcollections under missing parent documents. No field mask is used. Raw protocol values retain int64 strings, timestamps, references, bytes and special doubles. No Firestore mutation API is called.

The exporter uses the native [collection-ID API](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/listCollectionIds) and [document-list API](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/list). `showMissing` keeps missing parents reachable. Both APIs use the same read time. If any page fails, no complete capture marker is published.

`npm run archive:capture-legacy -- public_reader` is an explicit limited alternative. It performs two unrestricted server reads of the public `officials` collection used by the legacy app. SDK snapshots are preserved, reconstructed and compared with type-tagged observed values. Both reads must have the same data digest. This captures the complete observed application collection, including all fields and nested SALN arrays. It does not enumerate other collections or subcollections.

Raw captures and their checksummed provenance remain under ignored `.data/legacy-audit/`. They are non-canonical audit artifacts. The administrative document-tree export is also an audit export, not a Google-managed backup. Neither mode exports rules, indexes, storage, other databases, deleted records or history.

## Public report

Run `npm run archive:audit-legacy -- <capture-directory> <public-report-directory> [reviewed-snapshot.json]`. The command verifies capture file hashes, sizes, counts and scope. It streams every repository PDF to inventory its path, size, checksum and file header. A new report is written without overwriting an earlier report.

The report contains only selected audit fields. Raw records, names not already reviewed, contact details, external source URLs, amounts, generic statuses and inferred dates are excluded. Candidate Person and reporting-period associations remain explicit review inputs. Unknown identity keys and malformed SALN arrays enter a separate document review queue.

An exact repository checksum can be classified as an acquired Source Document only when a supplied, integrity-checked Public Data Snapshot already attaches those PDF bytes to the explicitly matched Archive-Eligible Person. Legacy article links remain unverified inputs until the publication is reviewed as a Secondary Report. An appointed role does not rule out former elected service. The current audit approves neither Secondary Reports nor out-of-scope exclusions.

## Dated evidence

[`legacy-2026-10-02/audit.json`](./legacy-2026-10-02/audit.json) describes the two live server reads taken on 2 October 2026 in Manila, recorded as 1 October UTC. Their observed data digest is `b1c4adc84c46fc6a4feaf2beac46f720a5b11037781a30e5efac043d0045f1df`, unchanged from the 26 September collection capture. Raw inputs are preserved locally and omitted from Git.

| Audit item | Count |
| --- | ---: |
| Legacy Person records | 49 |
| Referenced Person rows after the two explicit matches | 51 |
| Surviving Person identities | 49 |
| Preserved profile keys | 56 |
| Permanent redirects among those keys | 8 |
| Historical seed identifiers | 42 |
| Legacy SALN entries | 129 |
| Candidate Person-to-entry associations | 129 |
| Repository PDFs and candidate PDF-to-entry associations | 51 |
| Repository PDF bytes | 472348069 |
| Distinct PDF checksums | 51 |
| Missing PDF references or unreferenced PDFs | 0 |
| Unverified review inputs | 129 |
| Legacy submitted-status inputs, never adopted | 129 |
| Legacy year-end date inputs, never adopted | 58 |

The three acquired Hontiveros scans were checked through the local reviewed snapshot. They do not match legacy PDF paths, and the old Hontiveros share link points to another post. The legacy audit therefore has zero acquired Source Document entries. It also has zero reviewed Secondary Reports and zero reviewed out-of-scope exclusions.

The live administrative export could not run because this checkout has no Application Default Credentials. `completeDatabaseDocumentTree` is explicitly false in the dated report. Run and review the complete export before Firebase cutover. The administrative path is tested with paginated reads, missing parents, native value types and a failed page; it has not been verified against the live project. Public production data was not changed.
