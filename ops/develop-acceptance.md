# Develop acceptance report

Current status: **not accepted**. This PR prepares verification. It does not certify a live deployment or replace user acceptance. Run it after #64 establishes isolated resources.

`npm run archive:verify-release -- .data/acceptance/report.json` creates an empty temporary **local** SQL database, runs all migrations, imports the 33 ordered metadata manifests once, reconciles fixed counts/digests, resolves eligible profiles and aliases, and requires an unchanged second import and snapshot. It removes its temporary database after verification. It never mutates a remote database. The output file is private, newly created with restrictive permissions and never overwrites an older report.

When reviewed Filing manifests enter the plan, add `--sources .data/acceptance/source-files.json`. Its private format is `{"sourceFiles":{"<path-in-plan.manifests>":"<local-acquired-file>"}}`. Supply one file for each Filing manifest. The rehearsal verifies its signature, size and checksum through the shared importer, stores it in temporary local storage, and passes the same bytes and storage on replay. Missing or incorrect bytes fail verification. Private acquisition paths and source bytes do not enter the public report or Git.

To check a named deployment, append its origin and exact commit: `npm run archive:verify-release -- .data/acceptance/live-report.json https://develop--<site>.netlify.app <commit-sha>`. The verifier reads the revision header, public JSON, core pages, eligible profiles, aliases, unknown-route response and any declared document checksums. A mismatch stops verification. It does not submit a live Source Tip or change provider state. `/ping` keeps its existing `pong` response and adds the build revision header.

The fixed [stage-one plan](../data/release/stage-one.json) describes **reviewed metadata**: 27 eligible People and 29 Tenures. It contains no approved release Source Documents. The Risa 2024 source pages and Summary/reporting records are local verification examples; their publication dates need release review before a production manifest is prepared. Legacy PDFs have no approved R2 mappings. Zero in this baseline means zero approved release records, not no SALN in the real world. These gaps block document acceptance; do not pass them by changing an expected count to zero. Review and commit release-specific manifests, source-byte mappings and the complete expected baseline before acceptance.

## Required evidence

| Gate | Evidence to record | Current result |
| --- | --- | --- |
| Exact release | Deployed SHA, branch URL, Netlify deploy ID; build/typecheck/test results for that SHA | Pending live deployment |
| Isolation | Archive/private database IDs and hosts, R2 account/bucket, actual credential grants distinct from production | Pending |
| Empty staging migration | Staging creation/migration record and exact ledger matching plan | Local rehearsal only |
| Import/replay | Staging manifest IDs/digests; first applied and second unchanged; no extra writes | Local rehearsal only |
| Reconciliation | Every expected Person, Identity Match, Tenure, Filing, Source Document, alias, relationship, roster and checksum; exact snapshot version | Metadata baseline only |
| Legacy URLs | Profile aliases and every approved PDF mapping, one-hop destination, byte checksums, no loops | No approved PDF mapping |
| Browser review | Home, directory/search, profiles, Related Reporting, document open/download, gaps, private Source Tip success/failure, keyboard, 360px and desktop visuals | Prior local slice checks; live review pending |
| Private queue | Synthetic live tip reaches only the private destination; public snapshot stays unchanged; access is restricted | Pending |
| Runtime network | Browser network evidence contains no Firebase endpoint or call during all journeys | Pending |
| User acceptance | User's explicit acceptance of this exact deployed SHA and report | Pending |

Keep observations separate from conclusions. Attach actual evidence to the report, including unresolved failures. A local rehearsal, green CI, an HTTP 200 or a complete metadata roster cannot establish live acceptance alone. The report generator deliberately emits `not_accepted`; it never marks user approval. Record explicit acceptance separately, then use #66's production workflow. No merge, import or deployment is authorized by this report.
