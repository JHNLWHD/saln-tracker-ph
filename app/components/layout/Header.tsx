import { Link, NavLink } from 'react-router';

export function Header() {
  return (
    <>
      <a className="skip-link" href="#archive-content">Skip to main content</a>
      <header className="site-header">
        <div className="archive-container site-header-inner">
          <Link to="/" className="site-brand" aria-label="SALN Tracker PH home">
            <strong>SALN Tracker <span>PH</span></strong>
            <span className="site-tagline">An archive of public declarations</span>
          </Link>
          <nav aria-label="Main navigation" className="site-nav">
            <NavLink to="/" end>Archive</NavLink>
            <NavLink to="/about">About</NavLink>
            <NavLink to="/resources">Resources</NavLink>
          </nav>
        </div>
      </header>
      <div id="archive-content" tabIndex={-1} />
    </>
  );
}
