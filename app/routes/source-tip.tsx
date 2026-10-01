import { Header } from '../components/layout/Header';
import { Footer } from '../components/layout/Footer';
import { EmptyState } from '../components/ui/Archive';

export function meta() { return [{ title: 'Suggest a source | SALN Tracker PH' }, { name: 'description', content: 'Privately suggest a source for Archive review.' }]; }

export default function SourceTip() {
  return <><Header /><main className="archive-container py-8"><h1>Suggest a source</h1><EmptyState title="Source Tips are currently unavailable"><p>Please try again later. A Source Tip stays private until its evidence has been reviewed.</p></EmptyState></main><Footer /></>;
}
