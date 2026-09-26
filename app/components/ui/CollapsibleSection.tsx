import { type ReactNode } from 'react';
import { Badge } from './Badge';

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
        <Badge variant="info">{count} {count === 1 ? 'Person' : 'People'}</Badge>
      </summary>
      <div className="archive-disclosure-content">{children}</div>
    </details>
  );
}
