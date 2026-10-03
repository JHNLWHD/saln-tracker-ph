# House rollout proposal — issue #68

Status: **proposal; user approval pending**. No House batch issues were created. No House manifests were imported.

The [ticket map](../data/proposals/house-2026-10-02/ticket-map.json) proposes 33 tickets: one shared review, 29 bounded member batches, and three integration checks. The [batch list](../data/proposals/house-2026-10-02/README.md) shows all groups and counts. A source member ID identifies a row in the House directory. It does not identify a Person in the Archive.

## Source and limits

The [official House directory](https://congress.gov.ph/house-members) was inspected in Chrome on **2026-10-02**. Its All Representatives list showed **317 current members**: **253 district** and **64 party-list** representatives. It also showed **318 seats**. The inactive section contained seven records. The current and inactive TSV files are separate, checksum-bound projections of the visible table. They are not preserved HTML or SALN Source Documents. The copied current projection matched the browser projection in character count and transfer checksum.

Source Names retain the visible name headings. The directory's Speaker annotation belongs to a separate Chamber Leadership Office. It is not part of the Source Name. Source Names do not establish Canonical Names, Filer Names or Identity Matches.

Two review checks remain explicit:

- L042 is labeled `Iloilo City, 2nd District` in both the directory and member profile. J013 is labeled `Iloilo City, Lone District`. Retain these labels. Resolve their geography with attributable evidence before an approved mapping or import. Do not silently change L042 to Iloilo province. The member's local bill titles do not establish the Office by themselves.
- J038 appears only in the inactive section. No active Batanes representative appears in this projection. Account for the seat/count difference. Do not infer a successor or actual Tenure end date from that label.

The captured member set is complete as an observed source candidate. It is **not yet a canonical reviewed Roster Snapshot**. HOUSE-00 must review the source and shared mapping. Each member batch must review its own Person and Tenure mapping. The final integration ticket publishes one complete, dated House Roster Snapshot only after all mappings pass review.

## Typed geography and identity

Use `office-house-representative-ph` for House membership. Keep `office-house-speaker-ph` separate. Reuse the reviewed D027 Person (`person-faustino-bojie-dy-iii`) and representative Tenure. J027 remains a different Person. Review other identities against the existing legacy audit and approved People; a similar name is insufficient.

District representatives use a `legislative_district` Constituency. Assign a reviewed legislative district Jurisdiction and province/city relationships where the source supports them. Reuse existing approved IDs. A source area label is not a verified parent relationship. Reuse the existing `constituency-isabela-6` mapping to `jurisdiction-isabela` unchanged. A source discrepancy blocks that import until a separate supported migration is designed and approved; the current Editorial Correction workflow does not change Constituencies or Jurisdictions.

Party-list representatives use a `party_list` Constituency and the country Jurisdiction `jurisdiction-ph`. Members of the same organization share the reviewed Constituency. Do not invent numbered seats or a new Jurisdiction kind for an organization.

Keep actual Tenure start/end dates and Assumption Method unknown until supported. A directory's current-member label supports a dated Roster Snapshot. It does not prove the start date of the actual Tenure or the dates of an Electoral Term.

## Blocking edges and work order

1. Close #66 with the proven production workflow and explicit acceptance. Obtain approval of this #68 ticket map before creating any batch issues or importing House data.
2. HOUSE-00 reviews the full source projection, exclusions, disputed labels and shared geography IDs. It freezes the existing Person/legacy identity index and shared Office/Constituency/Jurisdiction IDs.
3. Prepare and accept HOUSE-D01 as the district pilot. Then prepare HOUSE-D02 through HOUSE-D23 from the same accepted baseline.
4. HOUSE-D-ACCEPT reconciles all 253 district source IDs. Its acceptance permits the party-list pilot HOUSE-P01.
5. Accept HOUSE-P01. Then prepare HOUSE-P02 through HOUSE-P06. HOUSE-P-ACCEPT reconciles all 64 party-list source IDs.
6. HOUSE-FINAL rechecks the release-date source and accepts all 317 mapped membership Tenures. Publish the complete reviewed House Roster Snapshot through the proven staging and production approval workflow. Provincial rollout follows this acceptance.

Only evidence and manifest preparation for disjoint batches can run in parallel after their pilot and shared review. A shared identity or geography conflict adds a blocking edge. Serialize operator imports, immutable ledger reconciliation, staging releases and production approval. An issue closes only after its explicit acceptance, so native issue dependencies can represent the pilot and review gates.

Each batch contains **at most 12 People**. District area groups and party-list organizations remain intact. Source groups are sorted by their captured labels and packed without splitting a group. Each batch also permits at most 12 initial Filings and 12 acquired Source Documents in total. Inventory overflow and propose a separate bounded follow-up for approval. No full itemization is planned.

## Acceptance for every member batch

Each batch in the JSON map declares all seven criteria below. Copy these criteria, its exact member IDs, source checksums and blocking edges into the proposed issue. Use GitHub native dependencies when the user approves publication. No publication command is part of this proposal.

1. **Evidence:** Review attributable Person/Office evidence for every listed source ID. Resolve conflicts with citations. Preserve exact source names and unknown date precision.
2. **Manifest:** Use reviewed immutable manifests with the accepted shared IDs and reviewed batch Person/Tenure IDs. Keep corrections append-only. Import once and prove unchanged replay. Reuse existing People and Tenures.
3. **Profile:** Check every canonical route, alias/legacy redirect, citation, Constituency and date precision. Show an honest Archive Gap when no Source Document is acquired. Keep Chamber Leadership separate.
4. **Document:** Inventory candidate SALNs. Preserve exact acquired bytes, provenance, Filer Name, Reporting Date, checksums and sizes. Verify immutable R2 keys and open/download responses. Bind each declared summary to exact pages. Zero trustworthy documents is an explicit archive finding, not a missing-file allegation. Record rejected candidates and overflow.
5. **Reconciliation:** Account for every batch source ID exactly once. Compare reviewed Person/Tenure mappings, manifest ledger, counts, source checksums, accepted/rejected candidates and route resolution. Review expected changes to the shared baseline separately from batch totals.
6. **Staging:** Use the isolated develop environment and operator credentials. Verify the exact revision, database/R2 separation, read-only runtime, snapshot replay, profile/document routes and Source Tip exclusion. A partial House batch must not replace the complete House Roster Snapshot scope.
7. **Approval:** Attach source review, reconciliation and exact deployed acceptance evidence. Obtain explicit user acceptance before production publication. Use #65/#66 recovery and cutover steps. Do not infer approval from a passing test or issue label.

## Fresh-context packet

Each issue must link this source capture and its exact batch in the ticket map. Include the accepted HOUSE-00 shared mapping/identity index, relevant legacy audit rows, at most 12 source member URLs, applicable manifests, expected counts, artifact checksums and the seven acceptance criteria. Include the latest accepted staging revision and production workflow report. Stop if those records disagree or a source member changed.

For a changed House source, save a new dated capture and review its differences. Keep this capture unchanged. A new source count or checksum requires a reviewed update to the ticket map and approval before publication or import.

## Local integrity check

Run `node --import tsx --test tests/house-proposal.test.ts`. The focused test verifies source counts/checksums, exclusions, complete non-overlapping batch coverage, group cohesion, bounds, typed kinds, explicit review flags, existing D027 identity reuse and an acyclic dependency graph. It does not grant editorial or production acceptance.
