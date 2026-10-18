# Hontiveros 2024 local verification examples

These version 1 manifests describe one reviewed Person, one Filing and three separately acquired Source Documents. They are local verification examples. They do not record production publication.

The Person manifest copies the reviewed Risa Hontiveros payload. All three Filing manifests use `filing-hontiveros-2024-12-31` and identical Filing metadata. Each has one distinct Source Document. The page 1 payload preserves the earlier local verification timestamp, `2026-09-26T13:46:46.395Z`. Page 2 and page 3 record the timestamp used for their local verification import. All four manifests were applied locally and then replayed without changes. Do not substitute these local timestamps for a production publication event.

Apply the Person manifest first, then the page manifests in file order. Supply the exact acquired JPEG for each Filing manifest. Source image bytes are kept outside Git. The files retain document-only Transcription Level; they contain no financial summary or itemization. The three images must remain attached to one Filing.

## Source acquisition

The [public release post](https://www.facebook.com/hontiverosrisa/posts/pfbid023VfwacSwo48weCW4X7RYbPmHcN5hXZFVd5VcurMpLTYFUzwxwxfbtuL2y7AWK9TDl) identifies the scans as Hontiveros's official SALN copy for 2024. The release was inspected on 26 September 2026. Facebook identified the publisher as the verified Senator Risa Hontiveros account and the photos as public.

Each displayed photo's public image URL was read from the rendered page. The exact URL was fetched without cookies or authentication headers and returned HTTP 200. The acquired JPEG bytes were preserved without resizing, re-encoding, annotation or combination. All three files are 837 by 1280 pixel Facebook renditions with the publisher's existing redactions, watermark and footer. They are not asserted to be the uploaded masters, unredacted declarations or a complete PDF. Expiring image delivery URLs are excluded from these public examples; the stable release permalinks appear below and in each manifest.

| Source Document | Page coverage | Media type | Bytes | SHA-256 |
| --- | --- | --- | ---: | --- |
| [First released scan](https://www.facebook.com/photo/?fbid=1381337553358339&set=pcb.1381296843362410) | Printed page 1 of 3 | `image/jpeg` | 140352 | `234672595635bb5d3564e6ccbf5223b40f8f80c96b7246e44c638c0c350fe9fa` |
| [Second released scan](https://www.facebook.com/photo/?fbid=1381337593358335&set=pcb.1381296843362410) | Liabilities, certification and execution; no printed page number visible above the publisher footer | `image/jpeg` | 160788 | `54f6e72dd45b8f01ecf22b9ebc7fbdf8ae919effebe8cde3382ee86e7aabeb69` |
| [Third released scan](https://www.facebook.com/photo/?fbid=1381337530025008&set=pcb.1381296843362410) | Printed page 3 of 3, additional sheet | `image/jpeg` | 138716 | `6460e85f9184bccf7dc0f685b4e830659152a0c0da4f69764b5460b2ebd3c2bd` |

The [Philippine News Agency article](https://www.pna.gov.ph/articles/1261401), published 20 October 2025, identifies Risa Hontiveros as a senator and attributes the SALN image to her Facebook. [PhilSTAR Life](https://philstarlife.com/news-and-views/421689-look-risa-hontiveros-releases-2024-saln) attributes its three republished images to the same account and links the release. Those publications support attribution. Their cropped or resized images are not used in these manifests.

## Reviewed metadata

The source's name fields read `HONTIVEROS-BARAQUEL`, `ANA THERESIA` and `N.`. Filer Name joins these fields in printed family-first order. The source's reporting heading establishes 31 December 2024 with day precision. The canonical Person name remains Risa Hontiveros.

The original Filing manifests leave Official Release Date, Execution Date and Custodian Receipt Date null. No publication date from a news article was used as the Official Release Date. The Person's cited public article establishes an included Elected Office; Tenure dates and Assumption Method remain unknown. This eligibility evidence does not assert membership in a current roster.

## Execution Date correction

The original four manifests retain their null Execution Date. `0005-execution-date-correction.json` adds a reviewed date to the current view through a separate correction. The second scan shows `10-Apr-25` beside the declarant signature, establishing 10 April 2025 with day precision. The separate oath stamp is not used as the Execution Date. The reason and stable source citation remain public; the original Filing and all three source images remain unchanged.

Apply the correction after the first four manifests with `npm run archive:import -- data/examples/hontiveros-2024-local-verification/0005-execution-date-correction.json`. It takes no source-file argument. This is a local verification example, not production publication.

## Summary Transcription and Related Reporting

`0006-reviewed-summary.json` copies the three printed total boxes after visual review on 2026-10-02: total assets PHP 19,884,098.21 from the additional sheet; liabilities PHP 897,840.00 and declared net worth PHP 18,986,258.21 from the certification scan. Each value retains its own Source Document ID and location. No itemization or independent wealth verification is implied. The exact acquired bytes and original document-only manifests remain unchanged; public extraction progress advances for the referenced scans.

`0007-related-reporting.json` publishes the already-reviewed PNA article only as a Secondary Report. It adds no Filing, Source Document, totals or coverage. Apply both after the existing five manifests. Replay must be a verified no-op. Correct metadata or totals through a new Editorial Correction targeting financial_summary or secondary_report. These remain local verification examples; they record no production publication.
