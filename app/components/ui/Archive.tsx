import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

export function EvidenceRow({ title, href, metadata, children }: {
  title: string;
  href: string;
  metadata: ReactNode;
  children?: ReactNode;
}) {
  return (
    <article className="evidence-row">
      <div>
        <p className="archive-label">Source Document</p>
        <h3><a href={href}>{title}</a></h3>
        <div className="archive-muted">{metadata}</div>
      </div>
      {children && <div className="evidence-row-detail">{children}</div>}
    </article>
  );
}

export function ArchiveTable({ caption, children }: { caption: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="archive-table-scroll" role="region" aria-labelledby={id} tabIndex={0}>
      <table className="archive-table">
        <caption id={id}>{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function EmptyState({ title = 'No SALN currently in the archive', children, action }: {
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="archive-empty">
      <h2>{title}</h2>
      {children && <div className="archive-muted">{children}</div>}
      {action && <div className="archive-empty-action">{action}</div>}
    </div>
  );
}

export function TextField({ id, label, hint, error, className = '', ...props }: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  hint?: string;
  error?: string;
}) {
  const describedBy = [props['aria-describedby'], hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="archive-field">
      <label htmlFor={id}>{label}{props.required && <span> (required)</span>}</label>
      {hint && <p id={`${id}-hint`} className="archive-muted">{hint}</p>}
      <input {...props} id={id} className={`archive-input ${className}`} aria-describedby={describedBy} aria-invalid={error ? true : props['aria-invalid']} />
      {error && <p id={`${id}-error`} className="archive-field-error">{error}</p>}
    </div>
  );
}

export function AdvocacyPanel({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <aside className="advocacy-panel" aria-labelledby={id}>
      <p className="archive-label">Advocacy · SALN Tracker PH</p>
      <h2 id={id}>{title}</h2>
      {children}
    </aside>
  );
}
