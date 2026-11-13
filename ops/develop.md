# Isolated develop deployment

Preparation only. The remote `develop` branch exists. The stacked PRs have not been merged. No staging Turso database, R2 bucket, private Source Tips destination or deployed revision is claimed as verified by this PR. Issue #64 stays open until its live criteria pass.

## Read-only visual preview

The preview copy on `develop` can use the public data saved on 18 October 2026 without any data service. Set `ARCHIVE_ENVIRONMENT=preview`, `ARCHIVE_ADAPTER=local`, `ARCHIVE_STORAGE=local`, `ARCHIVE_PREVIEW_BRANCH=develop` and `VITE_READ_ONLY_PREVIEW=true` only for the `develop` branch, including Builds and Functions scopes. Set `VITE_SITE_URL` to its preview URL. Do not supply Turso, R2, Source Tip or staging data-service settings. Disable Netlify prerender for this branch. Analytics is not initialized in this mode.

The build checks the actual develop branch context. Functions validate the explicit branch-scoped marker and the paired preview settings because Netlify does not provide build branch/context variables at runtime. Invalid or partial settings fail before data-service access. Home, search, original profiles and Git-held PDFs remain available. Reviewed-only UI views return an explicit unavailable response; static release snapshots remain separate downloadable artifacts. Source Tips show a disabled explanation and reject POST before reading its body or opening a client. Preview HTML and static files are noindex; robots disallows crawling and its sitemap is empty.

This is a visual preview of saved public data, not full staging acceptance or current source verification. The preview commits are independent copies; the original PRs stay open. Before later PR integration, restore the original develop tree with a separately authorized normal commit. Keep preview history and do not rewrite or merge the original PR branches for this preview.

The full staging deployment below remains a separate mode with all its existing requirements.

Enable only `develop` as a Netlify branch deployment. Set each variable for the **develop branch**, with the required build and Functions scopes. Never inherit production data credentials into branch deploys or deploy previews. The build command checks configuration and builds code. It performs no migration, import, schema initialization, backup or object upload. Non-production Netlify contexts other than a develop branch deployment fail closed.

Set the variables below through Netlify's UI, CLI or API. Select the `develop` branch value. Include both **Builds** and **Functions** scopes for runtime variables; use all scopes if the plan does not offer individual scopes. Values in `netlify.toml` are available only during the build. They do not configure `process.env` in Functions. A passing build cannot prove runtime configuration. Redeploy after changing runtime variables, then run the checks below without exposing their values.

## Resource and credential inventory

Record the actual Netlify site ID, branch URL, deployed commit, Turso database names/hosts, R2 account/bucket and private database name/host in the private acceptance report. Compare them with production's inventory before supplying credentials. Suggested names are `saln-archive-staging`, `saln-documents-staging` and `saln-tips-staging`; names alone do not prove isolation.

| Variable | Develop value / role | Required scopes |
| --- | --- | --- |
| `ARCHIVE_ENVIRONMENT` | `staging` | Builds and Functions |
| `ARCHIVE_ADAPTER`, `ARCHIVE_STORAGE` | `turso`, `r2` | Builds and Functions |
| `TURSO_DATABASE_URL` | Reviewed staging Archive URL | Builds and Functions |
| `TURSO_AUTH_TOKEN` | Database-specific **read-only** staging Archive token | Builds and Functions |
| `R2_ENDPOINT`, `R2_BUCKET` | Exact reviewed staging endpoint (including jurisdiction) and bucket name | Builds and Functions |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Object-read-only credentials restricted to that bucket | Builds and Functions |
| `SOURCE_TIPS_DATABASE_URL` | Private staging URL, separate from Archive | Builds and Functions |
| `SOURCE_TIPS_AUTH_TOKEN` | Separate private queue credential; restrict access to trusted reviewers and runtime | Builds and Functions |
| `SOURCE_TIPS_RATE_LIMIT_SECRET` | Separate server-only random key, at least 32 characters, for private client rate limits | Builds and Functions |
| `STAGING_TURSO_HOST`, `STAGING_SOURCE_TIPS_HOST` | Hosts from the reviewed staging inventory, including any custom port and matching the corresponding URLs | Builds |
| `STAGING_R2_ENDPOINT`, `STAGING_R2_BUCKET` | Endpoint and bucket from the reviewed staging inventory, matching the runtime values | Builds |
| `VITE_SITE_URL` | Develop branch URL, never production's URL | Builds |

Database URLs use HTTPS or libSQL at the root path without query parameters or fragments. Omit the default TLS port 443 from the reviewed host values. Include any custom port in both the reviewed host and its database URL. URL parameters cannot supply credentials or override TLS settings.

Create the public database token with Turso's native `turso db tokens create <staging-database> --read-only`. Review native R2 token scope. The build guard compares configured targets, rejects shared public/private tokens and common leaked secret variables. It cannot establish a provider's real token grants or prove that an asserted staging host is separate from production. Live inventory and access checks are required. No secret belongs in Git, a `VITE_` variable, a report, a PR or build output.

## Deliberate staging preparation

Use a private operator shell with staging **write** credentials. Do not put those credentials in Netlify. Run `npm run archive:migrate -- --environment staging` with `ARCHIVE_ENVIRONMENT=staging`.

Complete [Copy and verify](legacy-migration.md#copy-and-verify) against this same staging database before testing the default pages. Capture the public Firebase collection twice, prepare the immutable typed copy, rehearse its SQL locally, then apply it with the separate operator credential. Require the generated verification to match every typed source field and the captured profile and SALN entry counts. Replaying the same source must add no rows. Keep every `public/saln/` file at its original URL and compare its bytes. The copied records and totals do not require editorial review. An empty legacy table is not a complete staging migration.

Apply the separate reviewed release manifests with `npm run archive:import -- <manifest> [acquired-file] --environment staging`. Supply exact acquired bytes for any Filing manifests, with `ARCHIVE_STORAGE=r2`. Re-run identically and require verified `unchanged` results. Export with `npm run archive:export -- <private-output-directory>`. Initialize the private queue separately as described in [source-tips.md](source-tips.md).

Record the exact applied migration ledger, ordered manifest IDs/digests and resource identifiers. Verify checksums and counts before deploying. Restore the public read-only credentials for runtime. These operations never run in a build. This PR does not grant deployment or import approval.

## Runtime checks

Check the copied records on `/` and every original profile URL against the capture. Verify that `/people` redirects to `/` and retains a search query. Check totals, items, dates, source links and original `/saln/...` file bytes. Check secondary document routes separately, including reviewed Person aliases and any acquired `/documents/<sha256>` routes. Also check `/source-tip`, `/about`, `/resources` and unknown-route 404. `/data/archive.json` and `/data/source-checksums.json` redirect to the fixed release selected in `data/release/public-snapshot.json`. The files live at `/data/<version>/archive.json` and `/data/<version>/source-checksums.json`. Use that same version for both downloads. Imports cannot change these files. The live Turso Archive can have additional records awaiting the next release export.

After the approved reviewed-Archive import, export its public pair with `archive:export -- public/data`, check the exported version, and update the selector in the release PR. Commit both public files with that selector. Retain older version directories. The build validates every retained pair and its digest using local files only. Netlify and local Vite serve the version paths as static files, including HEAD and conditional requests, without Archive queries. The checked-in baseline contains 27 reviewed People and no release-approved Source Documents. It is separate from the full legacy copy. Future publication as reviewed Source Documents needs source evidence and R2 mappings; it does not block keeping the original PDFs available.

Observe browser traffic and verify no Firebase calls. Verify keyboard and narrow-screen journeys. Record exact deployed SHA, migration head, manifest sequence, snapshot version and staging IDs. User acceptance belongs to #65. Do not promote to main from a successful build alone.

Sources: [Netlify branch deploys](https://docs.netlify.com/deploy/deploy-types/branch-deploys/), [Functions environment variables](https://docs.netlify.com/build/functions/environment-variables/), [environment variable scopes and contexts](https://docs.netlify.com/build/environment-variables/overview/), [Turso read-only tokens](https://docs.turso.tech/cli/db/tokens/create).
