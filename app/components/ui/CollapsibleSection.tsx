import { type ReactNode } from 'react';

interface CollapsibleSectionProps {
  title: string;
  count: number;
  defaultExpanded?: boolean;
  children: ReactNode;
  className?: string;
}

export function CollapsibleSection({ title, count, defaultExpanded = false, children, className = '' }: CollapsibleSectionProps) {
  return (
    <details className={`archive-disclosure ${className}`} open={defaultExpanded}>
      <summary>
        <span>{title}</span>
        <span className="archive-muted text-sm">{count} {count === 1 ? 'Person' : 'People'}</span>
      </summary>
      <div className="archive-disclosure-content">{children}</div>
    </details>
  );
}
