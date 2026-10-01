# SALN Tracker PH

An open-ended Archive of acquired SALN Source Documents and reviewed Transcriptions for People who hold or held included elected Offices in the Philippines. The Archive does not verify real-world wealth, establish complete coverage or determine compliance.

## Development

```bash
npm ci
ARCHIVE_ADAPTER=local npm run dev
npm test
npm run typecheck
npm run build
```

Use the fixture adapter for an empty evidence-safe preview. Use a named local SQL database and explicit reviewed imports for a populated preview. Production and staging are separate resources. No build performs a migration or import.

The app uses React Router, system sans-serif text, white and cool-gray surfaces, blue links, thin rules and evidence tables. Advocacy stays in its labeled contribution area.

## Release and operator guides

- [Isolated develop deployment](ops/develop.md)
- [Develop acceptance](ops/develop-acceptance.md)
- [Private Source Tips](ops/source-tips.md)
- [Production cutover and locked recovery](ops/production-cutover.md)
- [Runtime and Git-held document retirement](ops/runtime-retirement.md)

`npm run archive:verify-release -- .data/acceptance/report.json` rehearses reviewed stage-one metadata in an empty temporary local database and verifies unchanged replay. Its report stays `not_accepted` until the live and user acceptance gates are resolved. Do not treat the rehearsal as a production deployment.

## Data Sources

The reviewed Archive publishes Source Documents from official downloads, documented formal releases, or exact preserved copies with known origin and custody. A public article can support Tenure evidence; it does not become a SALN Source Document. Legacy values and links require source review before they enter the canonical Archive.

## Design System

The redesign follows the compact navigation and table layout of the [BetterGov Budget Tracker](https://2026-budget.bettergov.ph/table) and the source metadata order of [BetterGov Open Data](https://data.bettergov.ph/datasets/4).

- **Colors**: White and cool-gray surfaces, dark text, blue links and active controls, and thin neutral rules.
- **Typography**: System sans-serif text, compact bold headings, and aligned tabular figures.
- **Layout**: A compact responsive masthead, visible search and filters, and dense evidence rows with clear Open and Download actions.
- **Accessibility**: Visible keyboard focus, labeled controls, native disclosures, and tables that scroll within their own region.
- **Records and advocacy**: Source Documents, Provenance, and reviewed Transcriptions stay neutral. Advocacy uses a separate labeled surface. Unknown dates and absent reviewed totals remain explicit.

## Contributing

### Local reviewed Archive

The public app requires a named Turso/libSQL Archive. The local fixture adapter is available with `ARCHIVE_ADAPTER=local`. There is no Firebase runtime fallback. Use a local SQLite file through libSQL to inspect the first reviewed Person:

```bash
npm ci
npm run archive:migrate
npm run archive:import-person -- data/reviewed/0001-ferdinand-marcos-jr.json
ARCHIVE_ADAPTER=turso TURSO_DATABASE_URL=file:.data/archive.db npm run dev
```

Open `/official/ferdinand-marcos-jr`. The profile shows cited Tenure evidence and the no-document state. The reviewed manifest does not establish a current Roster Snapshot or import legacy SALN values. Browse reviewed identities at `/people`; filters stay in the URL.

The import validates reviewed metadata and records its application in one transaction. An identical rerun verifies stored rows and is a no-op. To remove the current schema locally, run `npm run archive:migrate -- --down`, then migrate and import again. The `.data/` directory is ignored by Git.

CLI remote writes require both `--environment staging` and `ARCHIVE_ENVIRONMENT=staging`, plus `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. These commands do not enable production publication. Do not commit database files or credentials.

To add a reviewed Document-only Filing after its Person is imported:

```bash
ARCHIVE_STORAGE=local ARCHIVE_OBJECT_DIR=.data/objects npm run archive:import-filing -- reviewed-filing.json source-file
ARCHIVE_ADAPTER=turso TURSO_DATABASE_URL=file:.data/archive.db ARCHIVE_STORAGE=local ARCHIVE_OBJECT_DIR=.data/objects npm run dev
```

The manifest identifies the Filing, exact Filer Name, Reporting Date, provenance, SHA-256, byte size, and separate source dates. PDF, JPEG, and PNG originals are supported. Do not convert released scans into a new file and call it an original. The CLI validates bytes before storage and writes metadata in one transaction. A failed database write can leave an unlisted object; the public route serves only documents linked to an eligible Person. Existing evidence is never overwritten.

Open uses `/documents/:sha256`; Download uses the same route with `?download=1`. Both return the acquired bytes. Missing objects return a temporary-unavailable response. Document-only records have no reviewed summary totals; missing values are not zero.

For staging, set `ARCHIVE_STORAGE=r2`, `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` along with the staging database settings above. R2 writes use a conditional request to prevent overwrite. Local publication timestamps describe the local environment; production publication dates must be reviewed for the actual release. Production storage and release remain separate gated operations.

`data/examples/hontiveros-2024-page-1.local.json` records the real source used for local verification. It identifies the exact 140,352-byte Facebook-served JPEG, its stable release URL and checksum, and explicitly covers only page 1 of 3. Its publication timestamp is a local example, not a production release date. Import `data/reviewed/0002-risa-hontiveros.json` first. Acquire and verify the released image separately; source files belong in object storage and are not committed with this example. A platform may serve another rendition, so do not bypass a checksum mismatch.

### Repeatable manifests and Public Data Snapshots

Use `npm run archive:import -- manifest.json [source-file]` for a versioned manifest. Its envelope is `{ "id": "unique-review-id", "version": 1, "kind": "person" | "filing" | "correction" | "identities" | "roster" | "summary" | "secondary_report", "payload": { ... } }`. The payload uses the reviewed metadata format above. Unknown fields are rejected. After application, that ID and its canonical content cannot change; corrections use a new manifest in the correction workflow.

The compatibility commands `archive:import-person` and `archive:import-filing` use this same ledger with stable IDs derived from the Person or Source Document ID. A rerun checks the stored metadata and, for a Filing, verifies the stored bytes without uploading them again. New pages can join an existing Filing only when its metadata matches exactly. Same-period Filings remain distinct.

The examples in [the Hontiveros local verification directory](data/examples/hontiveros-2024-local-verification/README.md) demonstrate one Person, one Filing, three acquired image Source Documents, and an Editorial Correction of the Execution Date. Follow that README for source URLs, checksums and scope.

```bash
npm run archive:export -- .data/snapshots
```

This read-only export produces `<content-version>/archive.json` and `<content-version>/source-checksums.json`. Both share a content-derived version, and repeated exports are byte-identical. Existing artifacts are verified, not overwritten. The checksum file groups exact duplicate bytes while retaining each Source Document ID and Filing relationship in the snapshot. Only explicit public fields for Archive-Eligible People are exported; private tips, unverified queue tables, credentials, storage keys and import audit details are excluded. Exporting locally does not publish or deploy the files. Release packaging must use the validated pair together. The public download aliases select the reviewed version in `data/release/public-snapshot.json`; its immutable pair is checked into `public/data/<version>/`. Preparing a new pair and updating this selector are explicit release steps. Live Turso imports do not change a published snapshot.

### Editorial Corrections and Disputed Facts

Apply a correction with `npm run archive:import -- correction.json`. Its payload records the review, a public reason, the target record type and ID, the target's `previousCorrectionId` (null for the first), a `changes` object, and attributable citations supporting each changed fact. Supported targets are Person, Tenure, Filing, Source Document, Summary Transcription and Related Reporting metadata. A stale predecessor or changed manifest ID is rejected. A correction cannot replace identity links, source checksums, file bytes, storage keys, or file size/type.

Profiles and Public Data Snapshots use corrected metadata and show the correction history. The underlying records stay unchanged, so an original manifest can still replay after a correction. All conflict citations remain visible. A dispute about the Person or included Office removes that Tenure as an eligibility basis; a date-only dispute does not. A Person with another Verified Tenure can remain eligible. A direct profile link shows a scope notice when eligibility is unresolved.

## Historical capture

`archive:capture-legacy` and `archive:audit-legacy` are explicit operator audit commands. Their Firebase SDKs are development dependencies under `scripts/`, with no public app import path. Raw captures remain private and ignored. The complete database capture remains unverified until read-authorized ADC is available; a public collection capture is not a database backup. Firestore write/deploy commands have been retired. No remote Firestore data is deleted by this cleanup.

Current Git-held PDFs remain until the rollback deadline and complete R2 URL/recovery verification pass. Normal file removal must preserve Git history.
