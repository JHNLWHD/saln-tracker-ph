import { Link } from 'react-router';
import { Hashtags } from '../ui/Hashtags';

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white mt-16">
      <div className="container mx-auto px-4 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center space-x-3 mb-4">
              <div className="h-8 w-8 rounded-lg bg-flag-gradient flex items-center justify-center">
                <span className="text-white font-bold text-sm">PH</span>
              </div>
              <div>
                <h3 className="font-bold text-gray-900">SALN Tracker Philippines</h3>
                <p className="text-sm text-gray-600">Promoting Government Transparency</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed mb-4">
              A platform dedicated to tracking and monitoring the Statement of Assets, 
              Liabilities, and Net Worth (SALN) of Philippine public officials, 
              promoting transparency and accountability in government service.
            </p>
            <Hashtags size="md" />
          </div>
          
          <div>
            <h4 className="font-semibold text-gray-900 mb-3">Quick Links</h4>
            <ul className="space-y-2 text-sm text-gray-600">
              <li><Link to="/about" className="hover:text-primary-600">About SALN</Link></li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-gray-200 mt-8 pt-8 text-center text-sm text-gray-600">
          <p>&copy; {new Date().getFullYear()} SALN Tracker Philippines. Built with transparency and accountability in mind.</p>
        </div>
      </div>
    </footer>
  );
}
