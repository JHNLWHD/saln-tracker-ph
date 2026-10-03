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

This platform is designed to aggregate SALN data from official government channels only. Currently, the system displays a "No data yet" state as we work to establish proper data sourcing partnerships with relevant government agencies.

**Important:** All SALN data will be sourced exclusively from official channels to ensure accuracy and authenticity.

## Design System

The redesign follows the compact navigation and table layout of the [BetterGov Budget Tracker](https://2026-budget.bettergov.ph/table) and the source metadata order of [BetterGov Open Data](https://data.bettergov.ph/datasets/4).

- **Colors**: White and cool-gray surfaces, dark text, blue links and active controls, and thin neutral rules.
- **Typography**: System sans-serif text, compact bold headings, and aligned tabular figures.
- **Layout**: A compact responsive masthead, visible search and filters, and dense evidence rows with clear Open and Download actions.
- **Accessibility**: Visible keyboard focus, labeled controls, native disclosures, and tables that scroll within their own region.
- **Records and advocacy**: Source Documents, Provenance, and reviewed Transcriptions stay neutral. Advocacy uses a separate labeled surface. Unknown dates and absent reviewed totals remain explicit.

## Contributing

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
