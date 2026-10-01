import { Link } from 'react-router';
import { Header } from '../components/layout/Header';
import { Footer } from '../components/layout/Footer';

export function meta() {
  return [{ title: 'Resources | SALN Tracker PH' }, { name: 'description', content: 'SALN reference pages and the Archive methodology.' }];
}
export default function Resources() {
  return <><Header /><main className="archive-container max-w-3xl py-8 space-y-6">
    <h1>Resources</h1><p>These reference pages provide context. An external link is not an acquired Source Document or a reviewed Transcription.</p>
    <ul className="divide-y divide-gray-300">
      <li className="py-5 space-y-2"><h2 className="text-xl"><a className="text-primary-700 underline" href="https://csc.gov.ph/downloads/forms">Civil Service Commission forms</a></h2><p>Find SALN forms and other civil service forms on the Commission's website. Check its current guidance before using a form.</p></li>
      <li className="py-5 space-y-2"><h2 className="text-xl"><a className="text-primary-700 underline" href="https://www.ombudsman.gov.ph/request-for-copy-of-salns/">Office of the Ombudsman: request a SALN copy</a></h2><p>The Office publishes its request guidance and forms. Check the source page for its current process.</p></li>
      <li className="py-5 space-y-2"><h2 className="text-xl"><Link className="text-primary-700 underline" to="/about">Archive methodology</Link></h2><p>Read the eligibility rules, provenance categories, transcription limits and correction process.</p></li>
    </ul>
    <p className="archive-muted">Person profiles show Related Reporting separately, with a publisher and citation. Financial claims in articles are not imported as SALN totals.</p>
  </main><Footer /></>;
}
