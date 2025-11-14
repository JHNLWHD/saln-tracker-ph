import { Link } from 'react-router';
import { Hashtags } from '../ui/Hashtags';

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/95 backdrop-blur-sm">
      <div className="container mx-auto px-3 sm:px-4 lg:px-8">
        <div className="flex h-14 sm:h-16 items-center justify-between">
          {/* Logo and Title */}
          <div className="flex items-center space-x-2 sm:space-x-3 flex-1 min-w-0">
            <Link to="/" className="flex items-center space-x-2 sm:space-x-3 hover:opacity-80 transition-opacity min-w-0">
              <img
                src="/bettergov_logo.svg" 
                alt="BetterGov Logo"
                className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg flex-shrink-0"
              />
              <div className="min-w-0">
                <h1 className="text-base sm:text-xl font-bold text-gray-900 tracking-tight truncate">
                  SALN Tracker
                </h1>
                <p className="text-xs text-gray-600 hidden sm:block">Public Officials Philippines</p>
              </div>
            </Link>
          </div>

          {/* Mobile Menu and Navigation */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-6">
              <Link 
                to="/" 
                className="text-sm font-medium text-gray-700 hover:text-primary-600 transition-colors"
              >
                Home
              </Link>
              <Link 
                to="/about" 
                className="text-sm font-medium text-gray-700 hover:text-primary-600 transition-colors"
              >
                About
              </Link>
              <Link 
                to="/resources" 
                className="text-sm font-medium text-gray-700 hover:text-primary-600 transition-colors"
              >
                Resources
              </Link>
            </nav>

            {/* Mobile Navigation */}
            <nav className="flex md:hidden items-center space-x-3">
              <Link 
                to="/" 
                className="text-xs font-medium text-gray-700 hover:text-primary-600 transition-colors px-2 py-1"
              >
                Home
              </Link>
              <Link 
                to="/about" 
                className="text-xs font-medium text-gray-700 hover:text-primary-600 transition-colors px-2 py-1"
              >
                About
              </Link>
              <Link 
                to="/resources" 
                className="text-xs font-medium text-gray-700 hover:text-primary-600 transition-colors px-2 py-1"
              >
                Resources
              </Link>
            </nav>

            {/* Hashtags */}
            <div className="hidden sm:flex items-center">
              <Hashtags size="sm" className="px-2 lg:px-3" />
            </div>
          </div>
        </div>
        
        {/* Mobile Hashtags Row */}
        <div className="sm:hidden pb-2">
          <Hashtags size="sm" className="text-center w-full px-2" />
        </div>
      </div>
    </header>
  );
}
