import { formatAmount } from '../archive/financial';

export const summaryLabels = { totalAssets: 'Total assets', totalLiabilities: 'Total liabilities', declaredNetWorth: 'Declared net worth' };

export function FinancialTotals({ summary }: { summary: Record<keyof typeof summaryLabels, string | null> }) {
  return <dl className="stats grid grid-cols-1 gap-x-5 gap-y-4 tabular-nums sm:grid-cols-2">
    <div className="stat sm:col-span-2">
      <dt className="stat-title archive-label">Declared net worth</dt>
      <dd className="stat-value mt-1 break-all text-2xl font-bold leading-tight tracking-tight text-primary-700 sm:text-[2rem]">{summary.declaredNetWorth === null ? 'Not recorded' : formatAmount(summary.declaredNetWorth)}</dd>
    </div>
    {(['totalAssets', 'totalLiabilities'] as const).map(field => <div className="stat min-w-0" key={field}>
      <dt className="stat-title archive-muted text-sm">{summaryLabels[field]}</dt>
      <dd className="stat-value break-all text-base font-semibold">{summary[field] === null ? 'Not recorded' : formatAmount(summary[field])}</dd>
    </div>)}
  </dl>;
}
