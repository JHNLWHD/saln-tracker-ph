import { Link } from 'react-router';
import { Header } from '../components/layout/Header';
import { Footer } from '../components/layout/Footer';

export function meta() {
  return [{ title: 'About | SALN Tracker PH' }, { name: 'description', content: 'Learn about SALNs, declared totals and the sources behind SALN Tracker PH.' }];
}
export default function About() {
  return <><Header /><main className="archive-container max-w-3xl py-8 space-y-8">
    <h1>About SALN Tracker PH</h1>
    <p>SALN Tracker PH makes it easier to find the Statements of Assets, Liabilities and Net Worth of public officials in the Philippines.</p>
    <section className="space-y-3"><h2>What is a SALN?</h2>
      <p>A Statement of Assets, Liabilities and Net Worth (SALN) records a person's declared assets, liabilities and net worth for a reporting period.</p>
      <p>The figures on this site reflect those declarations. They are not an independent assessment of an official's wealth.</p>
      <Link className="text-primary-700 underline" to="/">Browse officials and their SALNs</Link>
    </section>
    <section className="space-y-3"><h2>Reading the numbers</h2>
      <p>Each profile shows available SALN entries by year, with declared totals and recorded asset and liability items. Separate entries for the same year stay separate.</p>
      <p>“Not recorded” means no amount is available in that field. Check the reporting year and source before comparing figures.</p>
      <p>Office details and current or former status reflect the available records. Dates are shown only to the precision those records support.</p>
    </section>
    <section className="space-y-3"><h2>Sources and coverage</h2>
      <p>Open the source links on each entry to inspect the supporting document or reporting. Source notes describe the origin when it is known.</p>
      <p>Available documents are kept as supplied. Unknown source details remain unknown.</p>
      <p>The site may not have a copy for every official or reporting period. A missing entry does not establish whether a SALN was filed.</p>
    </section>
    <section className="space-y-3"><h2>Suggest a source</h2>
      <p>Found a missing document or an error? Send a source URL and a short explanation. Submissions and optional contact details stay private while the source is checked.</p>
      <Link className="text-primary-700 underline" to="/source-tip">Suggest a source</Link>
    </section>
  </main><Footer /></>;
}
