import { Link } from 'react-router';
import { AdvocacyPanel } from '../ui/Archive';
import { Hashtags } from '../ui/Hashtags';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="archive-container">
        <div className="site-footer-record">
          <div>
            <p className="site-footer-brand">SALN Tracker PH</p>
            <p>Source Documents and reviewed Transcriptions for people who hold or held included elected offices in the Philippines.</p>
            <p>The Archive does not verify real-world wealth or determine compliance.</p>
          </div>
          <nav aria-label="Footer navigation" className="site-footer-links">
            <Link to="/">Archive</Link>
            <Link to="/about">About the Archive</Link>
            <Link to="/resources">Resources</Link>
            <a href="https://bettergov.ph/" target="_blank" rel="noopener noreferrer">Built by BetterGov.ph</a>
          </nav>
        </div>
        <AdvocacyPanel title="Support public access">
          <p>Help make public declarations easier to find and inspect.</p>
          <Hashtags variant="minimal" />
          <p><a href="https://discord.com/invite/5xBQmjWm" target="_blank" rel="noopener noreferrer">Join the community</a></p>
          {import.meta.env?.VITE_GITHUB_REPO && (
            <p><a href={`https://github.com/${import.meta.env.VITE_GITHUB_REPO}`} target="_blank" rel="noopener noreferrer">Contribute on GitHub</a></p>
          )}
        </AdvocacyPanel>
      </div>
    </footer>
  );
}
