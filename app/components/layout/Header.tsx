import { Link } from 'react-router';
import { Hashtags } from '../ui/Hashtags';

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/95 backdrop-blur-sm">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo and Title */}
          <div className="flex items-center space-x-4">
            <Link to="/" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
              <div className="h-8 w-8 rounded-lg bg-flag-gradient flex items-center justify-center">
                <span className="text-white font-bold text-sm">PH</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 tracking-tight">
                  SALN Tracker
                </h1>
                <p className="text-xs text-gray-600">Public Officials Philippines</p>
              </div>
            </Link>
          </div>

          {/* Simple Navigation */}
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
          </nav>

          {/* Hashtags */}
          <div className="flex items-center space-x-2">
            <Hashtags size="sm" className="lg:px-3" />
          </div>
        </div>
      </div>
    </header>
  );
}
