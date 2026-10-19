import { Link, NavLink } from 'react-router';

export function Header() {
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="site-header">
        <div className="archive-container site-header-inner">
          <Link to="/" className="site-brand" aria-label="SALN Tracker PH home">
            <strong>SALN Tracker <span>PH</span></strong>
            <span className="site-tagline">Public officials and their SALNs</span>
          </Link>
          <nav aria-label="Main navigation" className="site-nav">
            <NavLink to="/" end>Home</NavLink>
            <NavLink to="/about">About</NavLink>
            <NavLink to="/resources">Resources</NavLink>
          </nav>
        </div>
      </header>
      <div id="main-content" tabIndex={-1} />
    </>
  );
}
