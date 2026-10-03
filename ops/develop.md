# Isolated develop deployment

Preparation only. The remote `develop` branch exists. The stacked PRs have not been merged. No staging Turso database, R2 bucket, private Source Tips destination or deployed revision is claimed as verified by this PR. Issue #64 stays open until its live criteria pass.

Enable only `develop` as a Netlify branch deployment. Set each variable for the **develop branch**, with the required build and Functions scopes. Never inherit production data credentials into branch deploys or deploy previews. The build command checks configuration and builds code. It performs no migration, import, schema initialization, backup or object upload. Non-production Netlify contexts other than a develop branch deployment fail closed.

## Resource and credential inventory

Record the actual Netlify site ID, branch URL, deployed commit, Turso database names/hosts, R2 account/bucket and private database name/host in the private acceptance report. Compare them with production's inventory before supplying credentials. Suggested names are `saln-archive-staging`, `saln-documents-staging` and `saln-tips-staging`; names alone do not prove isolation.

| Variable | Develop value / role |
| --- | --- |
| `ARCHIVE_ENVIRONMENT` | `staging`, set in netlify.toml |
| `ARCHIVE_ADAPTER`, `ARCHIVE_STORAGE` | `turso`, `r2`, set in netlify.toml |
| `TURSO_DATABASE_URL`, `STAGING_TURSO_HOST` | Same reviewed staging Archive host |
| `TURSO_AUTH_TOKEN` | Database-specific **read-only** staging Archive token |
| `R2_ENDPOINT`, `R2_BUCKET`, `STAGING_R2_BUCKET` | Reviewed staging account endpoint and matching bucket name |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Object-read-only credentials restricted to that bucket |
| `SOURCE_TIPS_DATABASE_URL`, `STAGING_SOURCE_TIPS_HOST` | Matching private staging host, separate from Archive |
| `SOURCE_TIPS_AUTH_TOKEN` | Separate private queue credential; restrict access to trusted reviewers and runtime |
| `SOURCE_TIPS_RATE_LIMIT_SECRET` | Separate server-only random key, at least 32 characters, for private client rate limits |
| `VITE_SITE_URL` | Develop branch URL, never production's URL |

Create the public database token with Turso's native `turso db tokens create <staging-database> --read-only`. Review native R2 token scope. The build guard compares configured targets, rejects shared public/private tokens and common leaked secret variables. It cannot establish a provider's real token grants or prove that an asserted staging host is separate from production. Live inventory and access checks are required. No secret belongs in Git, a `VITE_` variable, a report, a PR or build output.

## Deliberate staging preparation

Use a private operator shell with staging **write** credentials. Do not put those credentials in Netlify. Run `npm run archive:migrate -- --environment staging` with `ARCHIVE_ENVIRONMENT=staging`. Apply the reviewed release manifests with `npm run archive:import -- <manifest> [acquired-file] --environment staging`. Supply exact acquired bytes for Filing manifests, with `ARCHIVE_STORAGE=r2`. Re-run identically and require verified `unchanged` results. Export with `npm run archive:export -- <private-output-directory>`. Initialize the private queue separately as described in [source-tips.md](source-tips.md).

Record the exact applied migration ledger, ordered manifest IDs/digests and resource identifiers. Verify checksums and counts before deploying. Restore the public read-only credentials for runtime. These operations never run in a build. This PR does not grant deployment or import approval.

## Runtime checks

Check `/`, `/people`, a named Person profile and aliases, `/documents/<sha256>`, reviewed `/saln/...` mappings, `/source-tip`, `/about`, `/resources` and unknown-route 404. `/data/archive.json` and `/data/source-checksums.json` redirect to the fixed release selected in `data/release/public-snapshot.json`. The files live at `/data/<version>/archive.json` and `/data/<version>/source-checksums.json`. Use that same version for both downloads. Imports cannot change these files. The live Turso Archive can have additional records awaiting the next release export.

After the approved import, export its public pair with `archive:export -- public/data`, check the exported version, and update the selector in the release PR. Commit both public files with that selector. Retain older version directories. The build validates every retained pair and its digest using local files only. Netlify and local Vite serve the version paths as static files, including HEAD and conditional requests, without Archive queries. The checked-in baseline contains the 27 reviewed People and no release-approved Source Documents; it does not close pending document review. Unreviewed legacy PDFs still need approved R2 mappings.

Observe browser traffic and verify no Firebase calls. Verify keyboard and narrow-screen journeys. Record exact deployed SHA, migration head, manifest sequence, snapshot version and staging IDs. User acceptance belongs to #65. Do not promote to main from a successful build alone.

Sources: [Netlify branch deploys](https://docs.netlify.com/deploy/deploy-types/branch-deploys/), [environment variable scopes and contexts](https://docs.netlify.com/build/environment-variables/overview/), [Turso read-only tokens](https://docs.turso.tech/cli/db/tokens/create).
