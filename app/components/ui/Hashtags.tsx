interface HashtagsProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'glass' | 'minimal';
  showSubtext?: boolean;
  className?: string;
}

export function Hashtags({ size = 'md', variant = 'default', showSubtext = false, className = '' }: HashtagsProps) {
  const sizes = { sm: 'advocacy-tags-sm', md: '', lg: 'advocacy-tags-lg' };
  const variants = { default: '', glass: '', minimal: 'advocacy-tags-minimal' };
  return (
    <div className={`advocacy-tags ${variants[variant]} ${sizes[size]} ${className}`}>
      <p className="archive-label">Advocacy</p>
      <p>#OpenSALN #PublicSALNNow</p>
      {showSubtext && <p>Support public access to SALNs</p>}
    </div>
  );
}
