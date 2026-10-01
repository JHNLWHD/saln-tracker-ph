# Production cutover

Preparation only. Production approval is absent. Develop is not accepted. Release-specific Source Document publication review and legacy PDF/R2 mappings are open. This PR does not import, merge, promote or deploy production. Keep #66 open.

## Before mutation

Record explicit user acceptance of the exact develop commit and its complete #65 report. Resolve every publication-review item in the release plan, including release-specific dates and acquired-byte paths. Record explicit production-deployment approval for that same commit. Agree a dated rollback deadline. Copy the [record template](../data/release/production-cutover.example.json) to an ignored private location and fill references from actual evidence. A filled JSON file is evidence routing; it does not grant permission by itself.

Verify production Turso, document R2, backup R2 and private Source Tips identifiers against staging. Use separate databases, buckets and credentials. Set whole-bucket **indefinite** locks on both production document and backup buckets before import, then read the rules back from Cloudflare. Native API locks can be administered later; retain the rule evidence and access controls. Restrict production public runtime to Archive database reads and document object reads. Keep operator writes out of Netlify. Builds never mutate data.

## Backup and import sequence

1. Stop competing editorial imports. Take an immediate live Turso **SQL dump** through the native `turso db shell <production-database> .dump` command into a new private file. Do not use `turso db export` as this SQL recovery artifact: that command produces a SQLite generation snapshot and its documentation warns that it may lag recent changes. Record the dump checksum and time. Keep all SQL dumps private.
2. Restore the pre-import SQL file into a fresh local database and require SQLite integrity success. Upload the exact file to a new release-scoped key in the locked backup bucket. Read it back and compare bytes and SHA-256. Never overwrite a recovery point.
3. Run `npm run archive:verify-recovery -- <private-cutover-record.json> before <accepted-commit>`. The command checks references, the review-complete release plan, live whole-bucket indefinite locks, SQL restoration and the exact locked backup object. It performs **reads only** against providers. `R2_CONFIG_READ_TOKEN` reads lock configuration; `BACKUP_R2_ACCESS_KEY_ID` and `BACKUP_R2_SECRET_ACCESS_KEY` read only the backup bucket.
4. Apply the accepted migration and ordered reviewed release once through an explicitly approved production operator operation. The generic staging CLIs continue to reject production. This preparation PR deliberately does not add a production-write bypass while accepted data and approval are absent. Use the shared migration/import functions only in that separately authorized operation; do not relabel production as staging. Reconcile the full expected inventory and verify a replay as unchanged.
5. Take the immediate post-import SQL dump. Restore it and require the accepted public snapshot version. Store a new locked `post.sql` recovery point and compare readback bytes and checksum. Run the verifier with `after`; it requires both pre and post recovery artifacts. A partial import or failed backup stops promotion.
6. Promote only the accepted develop state to main after explicit promotion/deployment approval. Set production reads to `ARCHIVE_ADAPTER=turso`, named production Turso, and `ARCHIVE_STORAGE=r2`. Use one metadata authority and no Firebase dual writes. Keep Firestore unchanged throughout the agreed rollback window. Do not run old Firestore migration/deploy commands.

## Verification and recovery

Record the actual Netlify deploy ID, exact SHA, resources, migration ledger, manifest digests, snapshot/checksum versions and locked recovery keys/hashes. Run #65 HTTP checks against production and repeat browser journeys, private Source Tip verification and network inspection. Verify stable profile/PDF routes, source open/download bytes and no Firebase calls. Provider limits for buffered document responses must be exercised with representative large exact files before acceptance.

If cutover fails, stop writes and retain all failure evidence. Restore the prior deployment/configuration during the agreed window; Firestore remains untouched. Never overwrite or delete locked documents to roll back metadata. Restore database state only through a separately approved recovery operation. After successful verification, report the result and recovery points to the user. #67 remains blocked until the agreed window ends and stable document access is proven. Remote Firestore deletion is a separate decision.

Sources: [Turso SQL dump example](https://turso.tech/blog/encrypting-sqlite-databases-with-turso), [Turso export limitations](https://docs.turso.tech/cli/db/export), [Cloudflare bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/), [read lock rules API](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/locks/methods/get/).
