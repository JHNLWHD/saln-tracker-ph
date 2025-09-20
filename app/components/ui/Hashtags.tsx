interface HashtagsProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'glass' | 'minimal';
  showSubtext?: boolean;
  className?: string;
}

export function Hashtags({ 
  size = 'md', 
  variant = 'default', 
  showSubtext = false,
  className = '' 
}: HashtagsProps) {
  const sizes = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-2 text-xs',
    lg: 'px-4 py-3 text-sm'
  };

  const variants = {
    default: 'bg-primary-50 border border-primary-200',
    glass: 'bg-white/10 backdrop-blur-sm border border-white/20',
    minimal: 'bg-transparent border-0'
  };

  const textColors = {
    default: 'text-primary-800',
    glass: 'text-accent-300',
    minimal: 'text-primary-600'
  };

  const subtextColors = {
    default: 'text-primary-600',
    glass: 'text-white/80',
    minimal: 'text-primary-500'
  };

  return (
    <div className={`rounded-lg inline-block ${variants[variant]} ${sizes[size]} ${className}`}>
      <p className={`font-medium ${textColors[variant]}`}>
        #OpenSALN #PublicSALNNow
      </p>
      {showSubtext && (
        <p className={`text-xs mt-1 ${subtextColors[variant]}`}>
          Help promote transparency in government
        </p>
      )}
    </div>
  );
}
