import { Link } from 'react-router';
import { Button } from './ui/Button';
import { Hashtags } from './ui/Hashtags';

interface CallToActionBannerProps {
  className?: string;
  submitUrl?: string; // External form for uploading/sharing data
  contactEmail?: string; // Fallback mailto link
  variant?: 'primary' | 'flag' | 'accent' | 'neutral';
}

export function CallToActionBanner({
  className = '',
  submitUrl = 'https://forms.gle/9eV6s1qscMb9pHii8',
  contactEmail = 'mailto:aljhoenilw+salntracker@gmail.com',
  variant = 'primary',
}: CallToActionBannerProps) {
  const variantClasses: Record<NonNullable<CallToActionBannerProps['variant']>, string> = {
    primary: 'bg-gradient-to-r from-primary-500 to-primary-600',
    flag: 'bg-flag-gradient',
    accent: 'bg-gradient-to-r from-accent-400 to-accent-500',
    neutral: 'bg-gradient-to-r from-gray-800 to-gray-900',
  };
  return (
    <section className={`rounded-xl ${variantClasses[variant]} text-white px-4 py-4 sm:px-6 sm:py-6 shadow-lg ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight leading-tight">
            Help us open up SALN data
          </h2>
          <p className="text-xs sm:text-sm text-white/90 leading-relaxed mt-1">
            Have copies, links, or tips about public officials’ SALNs? Share them with us or reach out. All SALN data sourced exclusively from official channels. We are a data aggregator, not the original source.
          </p>
          <div className="mt-2">
            <Hashtags variant="glass" size="sm" />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 sm:flex-shrink-0">
          <Button 
            variant="primary" 
            size="md" 
            className="w-full sm:w-auto"
            onClick={() => window.open(submitUrl, '_blank', 'noreferrer')}
          >
            Submit SALN Data
          </Button>
          <Button 
            variant="primary" 
            size="md" 
            className="w-full sm:w-auto"
            onClick={() => { window.location.href = contactEmail; }}
          >
            Contact Us
          </Button>
          <Link to="/about" className="sm:inline-flex">
            <Button variant="ghost" size="md" className="w-full sm:w-auto text-white hover:bg-white/10">
              Learn More
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}


