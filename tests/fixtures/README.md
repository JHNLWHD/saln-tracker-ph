# Public SALN regression baseline

`legacy-public-2026-10-18.json` contains the public fields from the two matching Firebase `officials` reads completed at `2026-10-18T15:07:32.248Z`. The validated source capture SHA-256 is `b1c4adc84c46fc6a4feaf2beac46f720a5b11037781a30e5efac043d0045f1df`. This hash identifies the original capture, not this reduced fixture.

The fixture has 49 profiles, 129 SALN entries, 129 asset items, 113 liability items and 129 source links. Its 629 amounts retain the source numbers, including decimals and zeros. It includes only document IDs; public name, slug, office, term and status fields; SALN years, totals, filing details and sources; and public asset/liability item fields. Absent optional item fields are represented as `null`. Raw SDK data, unknown fields, capture files and credentials are excluded.

`tests/saln-values.test.ts` copies this fixed baseline into a temporary local database through the migration command, loads the real Home and profile routes, and checks their rendered values by person, entry, year and label. Expected currency text comes from `Intl.NumberFormat`, independently of the app formatter. Synthetic cases cover missing and negative amounts and distinct entries in one year. CI runs both cases through `npm test`; no Firebase or hosted Turso connection is required.

This is a preservation test, not an audit of the original PDFs. It does not prove the data currently in a hosted database or a deployment. Do not regenerate the fixture from application output to make a failing test pass. Change it only for an explicitly accepted source-data update, with a new validated capture, field-by-field comparison and updated counts/provenance.
