# SALN Tracker Philippines 🇵🇭

A modern web platform dedicated to tracking and monitoring the Statement of Assets, Liabilities, and Net Worth (SALN) of Philippine public officials, promoting transparency and accountability in government service.

**#OpenSALN #PublicSALNNow**

## About

The SALN Tracker Philippines is designed to aggregate and display SALN records from official government channels, making it easier for citizens to access public financial disclosure information. This platform serves as a centralized hub for transparency data, helping promote good governance and public accountability.

## Features

- 📋 **Official Database** - Comprehensive list of current Philippine public officials (President, Vice President, Senators)
- 🔍 **SALN Records View** - Detailed display of financial declarations when available
- 🏛️ **Government Transparency** - Promotes accountability through public access to SALN data
- 📱 **Responsive Design** - Modern Filipino election website design with Philippine flag colors
- 🚀 **Fast Performance** - Built with React Router 7 and optimized for speed
- 🔒 **TypeScript** - Type-safe development for reliability
- 🎨 **TailwindCSS** - Beautiful, accessible styling with shadcn/ui patterns

## Getting Started

### Installation

Install the dependencies:

```bash
npm install
```

### Development

Start the development server with HMR:

```bash
npm run dev
```

Your application will be available at `http://localhost:5173`.

## Project Structure

```
app/
├── components/          # Reusable UI components
│   ├── ui/             # Base UI components (Button, Card, Badge, Hashtags)
│   ├── layout/         # Layout components (Header, Footer)
│   ├── OfficialsGrid.tsx    # Main officials listing
│   └── SALNRecordsView.tsx  # SALN records display
├── data/               # Data management
│   └── officials.ts    # Officials data and SALN helpers
├── routes/             # Application routes
│   ├── home.tsx       # Homepage with officials grid
│   ├── about.tsx      # About page with platform info
│   ├── official.$slug.tsx  # Individual official pages
│   └── $.tsx          # 404 Not Found page
└── app.css            # Global styles and Tailwind config
```

## Key Technologies

- **React Router 7** - Modern routing and server-side rendering
- **TypeScript** - Type safety and better developer experience
- **TailwindCSS** - Utility-first CSS framework
- **Vite** - Fast build tool and development server
- **Philippine Design System** - Custom theme with flag colors and cultural elements

## Building for Production

Create a production build:

```bash
npm run build
```

## Previewing a Production build

To preview a production build locally, use the [Netlify CLI](https://cli.netlify.com):

```bash
npx netlify-cli serve
```

```bash
npm run build
```

## Deployment

This template is preconfigured for deployment to Netlify.

Follow <https://docs.netlify.com/welcome/add-new-site/> to add this project as a site
in your Netlify account.

## Data Sources

The reviewed Archive publishes Source Documents from official downloads, documented formal releases, or exact preserved copies with known origin and custody. A public article can support Tenure evidence; it does not become a SALN Source Document. Legacy values and links require source review before they enter the canonical Archive.

## Design System

The redesign follows the compact navigation and table layout of the [BetterGov Budget Tracker](https://2026-budget.bettergov.ph/table) and the source metadata order of [BetterGov Open Data](https://data.bettergov.ph/datasets/4).

- **Colors**: White and cool-gray surfaces, dark text, blue links and active controls, and thin neutral rules.
- **Typography**: System sans-serif text, compact bold headings, and aligned tabular figures.
- **Layout**: A compact responsive masthead, visible search and filters, and dense evidence rows with clear Open and Download actions.
- **Accessibility**: Visible keyboard focus, labeled controls, native disclosures, and tables that scroll within their own region.
- **Records and advocacy**: Source Documents, Provenance, and reviewed Transcriptions stay neutral. Advocacy uses a separate labeled surface. Unknown dates and absent reviewed totals remain explicit.

## Contributing

### Local reviewed Archive

The relational Archive is opt-in while the legacy site remains the default. Use a local SQLite file through libSQL to inspect the first reviewed Person:

```bash
npm ci
npm run archive:migrate
npm run archive:import-person -- data/reviewed/0001-ferdinand-marcos-jr.json
ARCHIVE_ADAPTER=turso TURSO_DATABASE_URL=file:.data/archive.db npm run dev
```

Open `/official/ferdinand-marcos-jr`. The profile shows cited Tenure evidence and the no-document state. The reviewed manifest does not establish a current Roster Snapshot or import legacy SALN values. Canonical directory pages arrive in the later directory slice.

The import validates reviewed metadata and records its application in one transaction. An identical rerun verifies stored rows and is a no-op. To remove the current schema locally, run `npm run archive:migrate -- --down`, then migrate and import again. The `.data/` directory is ignored by Git.

CLI remote writes require both `--environment staging` and `ARCHIVE_ENVIRONMENT=staging`, plus `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. These commands do not enable production publication. Do not commit database files or credentials.

To add a reviewed Document-only Filing after its Person is imported:

```bash
ARCHIVE_STORAGE=local ARCHIVE_OBJECT_DIR=.data/objects npm run archive:import-filing -- reviewed-filing.json source-file
ARCHIVE_ADAPTER=turso TURSO_DATABASE_URL=file:.data/archive.db ARCHIVE_STORAGE=local ARCHIVE_OBJECT_DIR=.data/objects npm run dev
```

The manifest identifies the Filing, exact Filer Name, Reporting Date, provenance, SHA-256, byte size, and separate source dates. PDF, JPEG, and PNG originals are supported. Do not convert released scans into a new file and call it an original. The CLI validates bytes before storage and writes metadata in one transaction. A failed database write can leave an unlisted object; the public route serves only documents linked to an eligible Person. Existing evidence is never overwritten.

Open uses `/documents/:sha256`; Download uses the same route with `?download=1`. Both return the acquired bytes. Missing objects return a temporary-unavailable response. Document-only records have no reviewed summary totals; missing values are not zero.

For staging, set `ARCHIVE_STORAGE=r2`, `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` along with the staging database settings above. R2 writes use a conditional request to prevent overwrite. Local publication timestamps describe the local environment; production publication dates must be reviewed for the actual release. Production storage and release remain separate gated operations.

`data/examples/hontiveros-2024-page-1.local.json` records the real source used for local verification. It identifies the exact 140,352-byte Facebook-served JPEG, its stable release URL and checksum, and explicitly covers only page 1 of 3. Its publication timestamp is a local example, not a production release date. Import `data/reviewed/0002-risa-hontiveros.json` first. Acquire and verify the released image separately; source files belong in object storage and are not committed with this example. A platform may serve another rendition, so do not bypass a checksum mismatch.

### Repeatable manifests and Public Data Snapshots

Use `npm run archive:import -- manifest.json [source-file]` for a versioned manifest. Its envelope is `{ "id": "unique-review-id", "version": 1, "kind": "person" | "filing", "payload": { ... } }`. The payload uses the reviewed metadata format above. Unknown fields are rejected. After application, that ID and its canonical content cannot change; corrections use a new manifest in the correction workflow.

The compatibility commands `archive:import-person` and `archive:import-filing` use this same ledger with stable IDs derived from the Person or Source Document ID. A rerun checks the stored metadata and, for a Filing, verifies the stored bytes without uploading them again. New pages can join an existing Filing only when its metadata matches exactly. Same-period Filings remain distinct.

The four examples in [the Hontiveros local verification directory](data/examples/hontiveros-2024-local-verification/README.md) demonstrate one Person, one Filing and three acquired image Source Documents. Follow that README for source URLs, checksums and scope.

```bash
npm run archive:export -- .data/snapshots
```

This read-only export produces `<content-version>/archive.json` and `<content-version>/source-checksums.json`. Both share a content-derived version, and repeated exports are byte-identical. Existing artifacts are verified, not overwritten. The checksum file groups exact duplicate bytes while retaining each Source Document ID and Filing relationship in the snapshot. Only explicit public fields for Archive-Eligible People are exported; private tips, unverified queue tables, credentials, storage keys and import audit details are excluded. Exporting locally does not publish or deploy the files. Release packaging must use the validated pair together.

We welcome contributions that help improve government transparency in the Philippines. Please ensure all contributions align with our mission of promoting accountability through public access to official information.

## Legal Framework

The Statement of Assets, Liabilities, and Net Worth (SALN) is required under Philippine law for all public officials. This platform supports the constitutional right of citizens to access information on matters of public concern.

## See also

- [Guide: how to deploy a React Router 7 site to Netlify](https://developers.netlify.com/guides/how-to-deploy-a-react-router-7-site-to-netlify/)
- [React Router Documentation](https://reactrouter.com/)
- [TailwindCSS Documentation](https://tailwindcss.com/)

---

Built with ❤️ for Philippine transparency and accountability.
**#OpenSALN #PublicSALNNow**
