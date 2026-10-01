# House source capture and proposed ticket map

Status: **proposal, not approved or imported**. See [the rollout workflow](../../../ops/house-rollout.md).

The [official House directory](https://congress.gov.ph/house-members) was checked on 2026-10-02. The observed current set contains 317 members: 253 district and 64 party-list representatives. Seven inactive records are excluded. The directory displays 318 seats.

- [Current source names and IDs](members.tsv)
- [Inactive source records](inactive.tsv)
- [Source checksums, review flags, exact batch members and dependency map](ticket-map.json)

These TSV files are visible-table projections, not preserved HTML or SALN Source Documents. Source Names are not Canonical Names or Filer Names. A complete reviewed Roster Snapshot requires the identity/geography and batch acceptance in the workflow.

HOUSE-00 resolves shared source/geography/identity rules. District pilot HOUSE-D01 precedes the other district batches. HOUSE-D-ACCEPT precedes party-list pilot HOUSE-P01. The remaining party-list batches follow the accepted pilot. HOUSE-P-ACCEPT and HOUSE-D-ACCEPT block HOUSE-FINAL. #66 and approval of #68 block all work.

There are 29 member batches, with at most 12 People each. No district area group or party-list organization is split. Every batch declares evidence, manifest, profile, document, reconciliation, staging and approval criteria in the map. Source group labels remain provisional; L042/J013 requires source resolution in HOUSE-00.

| Proposed ticket | Members | Captured area or organization groups |
| --- | ---: | --- |
| HOUSE-D01 | 12 | Abra; Agusan del Norte; Agusan del Sur; Aklan; Albay; Antipolo City; Antique |
| HOUSE-D02 | 8 | Apayao; Aurora; Bacolod City; Baguio City; Basilan; Bataan |
| HOUSE-D03 | 12 | Batangas; Benguet; Biliran; Biñan City; Bohol |
| HOUSE-D04 | 11 | Bukidnon; Bulacan; Butuan |
| HOUSE-D05 | 11 | Cagayan; Cagayan de Oro City; Calamba City; Caloocan City; Camarines Norte |
| HOUSE-D06 | 9 | Camarines Sur; Camiguin; Capiz; Catanduanes |
| HOUSE-D07 | 8 | Cavite |
| HOUSE-D08 | 12 | Cebu; Cebu City; Cotabato |
| HOUSE-D09 | 12 | Davao City; Davao Occidental; Davao Oriental; Davao de Oro; Davao del Norte; Davao del Sur; Dinagat Islands |
| HOUSE-D10 | 9 | Eastern Samar; General Santos City; Guimaras; Ifugao; Iligan City; Ilocos Norte; Ilocos Sur |
| HOUSE-D11 | 12 | Iloilo; Iloilo City; Isabela |
| HOUSE-D12 | 12 | Kalinga; La Union; Laguna; Lanao del Norte; Lanao del Sur; Lapu-Lapu City |
| HOUSE-D13 | 12 | Las Piñas City; Leyte; Maguindanao del Norte; Maguindanao del Sur; Makati City; Malabon City; Mandaluyong City |
| HOUSE-D14 | 10 | Mandaue City; Manila; Marikina City; Marinduque |
| HOUSE-D15 | 10 | Masbate; Misamis Occidental; Misamis Oriental; Mountain Province; Muntinlupa City; Navotas City |
| HOUSE-D16 | 11 | Negros Occidental; Negros Oriental; Northern Samar |
| HOUSE-D17 | 11 | Nueva Ecija; Nueva Vizcaya; Occidental Mindoro; Oriental Mindoro; Palawan |
| HOUSE-D18 | 12 | Pampanga; Pangasinan; Parañaque City |
| HOUSE-D19 | 12 | Pasay City; Pasig City; Quezon; Quezon City |
| HOUSE-D20 | 12 | Quirino; Rizal; Romblon; Samar; San Jose Del Monte City; San Juan City; Santa Rosa City; Sarangani |
| HOUSE-D21 | 12 | Siquijor; Sorsogon; South Cotabato; Southern Leyte; Sultan Kudarat; Sulu |
| HOUSE-D22 | 12 | Surigao del Norte; Surigao del Sur; Taguig City; Taguig City-Pateros; Tarlac; Tawi-Tawi; Valenzuela City |
| HOUSE-D23 | 11 | Zambales; Zamboanga City; Zamboanga Sibugay; Zamboanga del Norte; Zamboanga del Sur |
| HOUSE-P01 | 12 | 1-RIDER PARTYLIST; 1TAHANAN; 4K; 4Ps; ABAMIN; ABANG LINGKOD; ABONO; ACT TEACHERS; ACT-CIS; AGAP |
| HOUSE-P02 | 12 | AGIMAT; AKBAYAN; AKO BIKOL; AKO BISAYA; AKO ILOCANO AKO; ALONA; ANG PROBINSYANO; APEC; ASENSO PINOY |
| HOUSE-P03 | 12 | BH; BICOL SARO; CIBAC; COOP-NATCCO; CWS; DUMPER PTDA; FPJ PANDAY BAYANIHAN; GABRIELA; GP (GALING SA PUSO); KABATAAN; KAMALAYAN; KAMANGGAGAWA |
| HOUSE-P04 | 12 | KAPUSO PM; KM NGAYON NA; KUSUG TAUSUG; LPGMA; MAGBUBUKID; MALASAKIT@BAYANIHAN; MANILA TEACHERS; ML; MURANG KURYENTE; NANAY; ONE COOP; PHILRECA |
| HOUSE-P05 | 12 | PINOY WORKERS; PPP; PUSONG PINOY; SAGIP; SENIOR CITIZENS; SOLID NORTH PARTY; SSS-GSIS PENSYONADO; SWERTE; TGP; TINGOG |
| HOUSE-P06 | 4 | TRABAHO; TUCP; UNITED SENIOR CITIZENS; USWAG ILONGGO |


The 33 proposed tickets (HOUSE-00, 29 member batches, and three integration checks) remain unpublished. The map has no approval reference. Do not create issues or import it until the user approves the concrete map.
