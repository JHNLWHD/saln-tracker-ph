# Runtime and Git-held document retirement

**Merge only after #66 succeeds and the agreed rollback window closes without a Firestore rollback.** This branch prepares the code cleanup; it is not a production cleanup report. No Git-held PDF or remote Firestore record was removed.

The public app now uses Turso by default, requires a named database and has no Firebase fallback. The Firebase runtime adapter, browser initialization, legacy presentation types, Firestore migration writer and deployment configuration/commands are removed. The two Firebase SDK packages remain **development-only** for the explicit operator capture and its integrity tests. That read-only historical capture lives under `scripts/`, has no import path from `app/`, and preserves the unresolved database-wide audit in #56. It is not a production runtime dependency or a metadata write path.

Before merging, record the successful production report, agreed deadline and absence of a rollback. Verify the built public server/client contain no Firebase modules or calls. Repeat build, typecheck, tests, route checks and browser network observation after deploying the accepted cleanup SHA. Removing code does not delete Firestore data; any remote deletion is a separate user decision.

## Document removal plan

Copy the [template](../data/release/document-retirement.example.json) to a private ignored file. Supply the successful production reference, expired rollback deadline, recovery commit containing exact document bytes, current production commit/snapshot, and **one reviewed Source Document mapping for every tracked PDF**.

Run `npm run archive:verify-retirement -- <private-record.json> <production-origin>`. The verifier is read-only. It requires complete tracked-file coverage, exact current/Git-history checksums, a matching public snapshot mapping, a one-hop stable URL and the exact canonical document bytes. The stable URL must route to the document endpoint rather than serve the old static file. If the live static file still takes precedence, establish and verify a scoped Netlify redirect to the reviewed canonical route during the approved cutover; never force a wildcard mapping or bypass review. Confirm the production runtime is actually using the named R2 resource through the deployment report.

Only after every check passes, use `git rm -- <verified-paths>` in the approved cleanup branch. Commit the normal deletion; do not rewrite history. Re-run the verifier before removing files, then check production URLs and checksums again after deployment. Keep the recovery commit and locked recovery artifacts. The command prints a removal plan and never deletes a file itself.

The present baseline has **zero approved legacy PDF/R2 mappings**. All 51 Git-held PDFs remain tracked. Their removal and the live final production report remain open acceptance criteria in #67.
