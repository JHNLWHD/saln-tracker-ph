import { Link } from 'react-router';
import GitHubButton from 'react-github-btn';
import { Hashtags } from '../ui/Hashtags';

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white mt-12 sm:mt-16">
      <div className="container mx-auto px-3 sm:px-4 lg:px-8 py-6 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 sm:gap-8">
          <div className="col-span-1 lg:col-span-3">
            <div className="flex items-center space-x-2 sm:space-x-3 mb-3 sm:mb-4">
              <img
                src="/bettergov_logo.svg" 
                alt="BetterGov Logo"
                className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg flex-shrink-0"
              />
              <div>
                <h3 className="font-bold text-gray-900 text-sm sm:text-base">SALN Tracker Philippines</h3>
                <p className="text-xs sm:text-sm text-gray-600">Promoting Government Transparency</p>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-gray-600 leading-relaxed mb-3 sm:mb-4">
              A platform dedicated to tracking and monitoring the Statement of Assets, 
              Liabilities, and Net Worth (SALN) of Philippine public officials, 
              promoting transparency and accountability in government service.
            </p>
            <div className="mb-4 sm:mb-0">
              <Hashtags size="sm" className="sm:hidden" />
              <Hashtags size="md" className="hidden sm:inline-block" />
            </div>

          </div>
          
          <div className="lg:col-span-1">
            <h4 className="font-semibold text-gray-900 mb-2 sm:mb-3 text-sm sm:text-base">Quick Links</h4>
            <ul className="space-y-1 sm:space-y-2 text-xs sm:text-sm text-gray-600">
              <li><Link to="/about" className="hover:text-primary-600 transition-colors">About SALN</Link></li>
              <li><Link to="/resources" className="hover:text-primary-600 transition-colors">Resources</Link></li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-gray-200 mt-6 sm:mt-8 pt-4 sm:pt-8 text-center text-xs sm:text-sm text-gray-600">
          <p>&copy; {new Date().getFullYear()} SALN Tracker Philippines. Built with transparency and accountability in mind.</p>
          <p className="mt-2">Built by <Link to="https://bettergov.ph/" target="_blank" rel="noopener noreferrer" className="hover:text-primary-600 transition-colors">BetterGov.ph</Link> • <Link to="https://discord.com/invite/5xBQmjWm" target="_blank" rel="noopener noreferrer" className="hover:text-primary-600 transition-colors">Join our Discord</Link></p>
          {import.meta.env.VITE_GITHUB_REPO && (
            <div className="mt-3 sm:mt-4 flex items-center justify-center gap-3">
              <a
                className="text-xs sm:text-sm text-primary-600 hover:text-primary-700 underline underline-offset-2"
                href={`https://github.com/${import.meta.env.VITE_GITHUB_REPO}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Contribute on GitHub
              </a>
              <span className="inline-flex items-center">
                <GitHubButton
                  href={`https://github.com/${import.meta.env.VITE_GITHUB_REPO}`}
                  data-icon="octicon-star"
                  data-size="large"
                  data-show-count="true"
                  aria-label={`Star ${import.meta.env.VITE_GITHUB_REPO} on GitHub`}
                >
                  Star
                </GitHubButton>
              </span>
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
