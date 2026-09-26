interface HashtagsProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'glass' | 'minimal';
  showSubtext?: boolean;
  className?: string;
}

export function Hashtags({ size = 'md', variant = 'default', showSubtext = false, className = '' }: HashtagsProps) {
  return (
    <div className={`advocacy-tags advocacy-tags-${variant} advocacy-tags-${size} ${className}`}>
      <p className="archive-label">Advocacy</p>
      <p>#OpenSALN #PublicSALNNow</p>
      {showSubtext && <p>Support public access to SALNs</p>}
    </div>
  );
}
