import { useState, type ReactNode } from 'react';
import { Badge } from './Badge';

interface CollapsibleSectionProps {
  title: string;
  count: number;
  defaultExpanded?: boolean;
  children: ReactNode;
  className?: string;
}

export function CollapsibleSection({ 
  title, 
  count, 
  defaultExpanded = false, 
  children,
  className = ''
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className={`border border-gray-200 rounded-lg overflow-hidden ${className}`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 sm:p-5 bg-gray-50 hover:bg-gray-100 transition-colors duration-200"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-3 sm:gap-4">
          <svg
            className={`w-5 h-5 sm:w-6 sm:h-6 text-gray-600 transition-transform duration-200 flex-shrink-0 ${
              isExpanded ? 'rotate-90' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>

          <h3 className="text-base sm:text-lg font-bold text-gray-900 text-left">
            {title}
          </h3>
        </div>

        <Badge variant="info" size="md" className="flex-shrink-0">
          {count} {count === 1 ? 'Official' : 'Officials'}
        </Badge>
      </button>

      <div
        className={`transition-all duration-300 ease-in-out ${
          isExpanded 
            ? 'max-h-[10000px] opacity-100' 
            : 'max-h-0 opacity-0 overflow-hidden'
        }`}
      >
        <div className="p-4 sm:p-6 bg-white">
          {children}
        </div>
      </div>
    </div>
  );
}

