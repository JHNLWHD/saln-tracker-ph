import { Link } from 'react-router';
import { Header } from '../components/layout/Header';
import { Footer } from '../components/layout/Footer';

export function meta() {
  return [{ title: 'Resources | SALN Tracker PH' }, { name: 'description', content: 'SALN forms, source documents and guidance for reading declared totals.' }];
}
export default function Resources() {
  return <><Header /><main className="archive-container max-w-3xl py-8 space-y-6">
    <h1>Resources</h1><p>Find SALN forms, guidance on requesting copies, and help reading the data.</p>
    <ul className="divide-y divide-gray-300">
      <li className="py-5 space-y-2"><h2 className="text-xl"><a className="text-primary-700 underline" href="https://csc.gov.ph/downloads/forms">Civil Service Commission forms</a></h2><p>Find SALN forms and other civil service forms on the Commission's website. Check its current guidance before using a form.</p></li>
      <li className="py-5 space-y-2"><h2 className="text-xl"><a className="text-primary-700 underline" href="https://www.ombudsman.gov.ph/request-for-copy-of-salns/">Office of the Ombudsman: request a SALN copy</a></h2><p>The Office publishes its request guidance and forms. Check the source page for its current process.</p></li>
      <li className="py-5 space-y-2"><h2 className="text-xl"><Link className="text-primary-700 underline" to="/about">How to read the data</Link></h2><p>Learn about declared totals, reporting periods and the sources behind each entry.</p></li>
    </ul>
    <p className="archive-muted">Each profile links to its available sources. Check those sources for the full declaration and its context.</p>
  </main><Footer /></>;
}
