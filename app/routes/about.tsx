import { Link } from 'react-router';
import { Header } from '../components/layout/Header';
import { Footer } from '../components/layout/Footer';

export function meta() {
  return [{ title: 'About the Archive | SALN Tracker PH' }, { name: 'description', content: 'The Archive scope, source provenance, transcription method and limits.' }];
}
export default function About() {
  return <><Header /><main className="archive-container max-w-3xl py-8 space-y-8">
    <h1>About the Archive</h1>
    <p>SALN Tracker PH is an open-ended Archive of acquired Source Documents and reviewed Transcriptions. It covers People who hold or held included elected Offices in the Philippines.</p>
    <section className="space-y-3"><h2>What the Archive covers</h2>
      <p>A Statement of Assets, Liabilities, and Net Worth (SALN) records a declarant's stated assets, liabilities and net worth. The Archive presents those declarations. It does not verify real-world wealth or determine compliance.</p>
      <p>National, provincial, city and municipal elected Offices are included. Barangay and Sangguniang Kabataan Offices are excluded. A former elected officeholder can remain eligible while holding an appointed Office.</p>
      <p>Archive coverage grows as evidence is acquired and reviewed. An Archive Gap means that a Source Document is not currently in the Archive. It does not establish a missing Filing or a failure to file.</p>
      <Link className="text-primary-700 underline" to="/people">Browse Archive-Eligible People</Link>
    </section>
    <section className="space-y-3"><h2>Identity and Office evidence</h2>
      <p>A Person needs attributable evidence of an included elected Office. A public article can establish a Tenure. Official records are preferred. A citation identifies what each source supports.</p>
      <p>Actual Tenure dates stay separate from scheduled Electoral Terms. Unknown dates remain unknown. Current Office membership comes from a manual, dated Roster Snapshot; an open-ended Tenure is not proof of current membership.</p>
      <p>Canonical Names, Name Variants and Filer Names remain distinct. Separate Filings for the same reporting period remain separate.</p>
    </section>
    <section className="space-y-3"><h2>Source Documents and provenance</h2>
      <p>The Source Document is canonical. Its acquired bytes stay unchanged and have a SHA-256 checksum. The Archive does not combine screenshots into a replacement PDF or reconstruct missing pages.</p>
      <p>Each document states whether it is an Official Download, a Formally Released Copy or a Preserved Copy. Its provenance note records the source and limits. A preserved public copy does not become an official release merely because the Archive holds it.</p>
      <p>Reporting, execution, receipt, official release, acquisition and Archive publication dates describe different events. Dates retain the precision that the source supports.</p>
    </section>
    <section className="space-y-3"><h2>Transcription and corrections</h2>
      <p>Documents can be published before transcription. Reviewed Summary totals link each amount to its Source Document and location. A blank Summary means that the amount is not transcribed; it does not mean zero.</p>
      <p>Related Reporting stays separate from Source Documents and Transcriptions. Article claims and estimates are not SALN amounts.</p>
      <p>Reviewed manifests publish metadata. Editorial Corrections record changes without replacing acquired bytes or erasing prior decisions. Public Data Snapshots export metadata and checksums; they exclude private Source Tips.</p>
    </section>
    <section className="space-y-3"><h2>Suggest a source</h2>
      <p>Send a URL and explanation for private review. Contact information is optional. A Source Tip does not become published evidence automatically.</p>
      <Link className="text-primary-700 underline" to="/source-tip">Suggest a source for private review</Link>
    </section>
  </main><Footer /></>;
}
