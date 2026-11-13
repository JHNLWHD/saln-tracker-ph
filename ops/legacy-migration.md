# Preserve the existing tracker data

The redesign keeps every existing public Firebase profile and nested SALN entry as-is in hosted Turso. Editorial review is not a migration or display gate. Original totals, item arrays, dates, statuses, source links and unknown fields stay in the typed capture. The public view uses the original public fields and document-ID URLs. The reviewed document tables do not replace or change that copy.

Profiles with absent or non-array SALN fields remain in the typed copy. SQL record counts include array entries.

The 18 October 2026 comparison found 49 profiles and 129 SALN entries. Every typed field matched the selected hosted database. All 51 Git-held PDFs matched their original bytes. The public Firebase collection is the application's data source; this comparison does not claim a backup of the entire Firebase project.

## Copy and verify

1. Run `npm run archive:capture-legacy -- public_reader`. It reads the complete application collection twice, rejects a changed result and preserves the private typed source under ignored `.data/`.
2. Run `npm run archive:prepare-legacy-copy -- <capture-directory> <new-private-output-directory>`. This validates source integrity and prepares SQL without writing a database.
3. Rehearse `copy.sql` in an isolated local database. Use the separate operator write credential to apply it to the selected hosted database. The generated transaction adds an immutable capture; it does not alter canonical records or Firebase. Keep a private before-state backup before any write.
4. Run `verify.sql`. Require the expected profile and entry counts, `source_data_matches = 1`, `capture_identity_matches = 1` and `source_is_active = 1`. An identical source-data checksum adds no rows. A later unchanged capture keeps the first capture metadata, so `capture_metadata_matches` can be zero in that case. The runtime selects the greatest `captured_at`, then the greatest source digest to break ties. If the source changes from A to B and returns to A, the immutable A copy can verify its stored data while B remains active. `source_is_active = 0` blocks acceptance. Stop the migration and resolve the selected source before release.
5. Check every original profile URL, SALN entry, item, amount and source link through the application. Keep all `public/saln/` files at their existing URLs and verify their SHA-256 values. Do not delete a copy to satisfy a reviewed-Archive count.

The default pages use ordinary SALN Tracker wording without migration labels or a legacy/reviewed mode switch. Home provides search and position groups, and `/people` redirects there. Existing `?view=reviewed` URLs retain the secondary document view with the same SALN branding. Its static `/data/archive.json` snapshot describes reviewed records only. A database without the optional legacy capture retains the document view. Runtime credentials must be read-only; imports never run during build or application startup.

Keep raw captures, generated SQL, database backups and credentials private and out of Git. The public UI selects only known public fields; it never sends raw capture metadata or private fields to the browser. Missing values remain unknown, and source URLs retain their original meaning. No automatic name match, date inference, total recalculation or evidence promotion is part of the copy.
