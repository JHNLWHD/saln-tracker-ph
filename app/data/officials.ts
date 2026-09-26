import currency from 'currency.js';

export interface Asset {
  description: string;
  value: number;
  source?: string;
}

export interface Liability {
  creditor: string;
  nature: string;
  balance: number;
}

export interface SALNRecord {
  year: number;
  net_worth: number;
  total_assets: number;
  total_liabilities: number;
  assets: Asset[];
  liabilities: Liability[];
  date_filed: string;
  status: 'submitted' | 'verified' | 'under_review' | 'flagged';
  source_url?: string;
  source_description?: string;
}

const VALID_AGENCIES = ['EXECUTIVE', 'LEGISLATIVE', 'CONSTITUTIONAL_COMMISSION', 'JUDICIARY'] as const;
export type Agency = typeof VALID_AGENCIES[number];

const VALID_STATUSES = ['active', 'inactive'] as const;
export type Status = typeof VALID_STATUSES[number];

export interface Official {
  slug: string;
  name: string;
  position: string;
  agency: Agency;
  status: Status;
  term_start?: string;
  term_end?: string;
  saln_records?: SALNRecord[];
}

export function generateSlug(official: Official | { name: string }): string {
  const name = official.name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();

  return name;
}

export function formatCurrency({ amount, shorten = false }: { amount: number, shorten: boolean }): string {
  const options = {
    symbol: '₱',
    precision: 0,
    separator: ',',
    decimal: '.',
    pattern: '! #',
    negativePattern: '(! #)'
  };

  if (shorten) {
    if (amount >= 1000000000) {
      const billions = currency(amount / 1000000000, { precision: 1 });
      return `₱${billions.format(options).replace('₱', '')}B`;
    } else if (amount >= 1000000) {
      const millions = currency(amount / 1000000, { precision: 1 });
      return `₱${millions.format(options).replace('₱', '')}M`;
    } else if (amount >= 1000) {
      const thousands = currency(amount / 1000, { precision: 1 });
      return `₱${thousands.format(options).replace('₱', '')}K`;
    }
  }

  return currency(amount, options).format();
}

export function formatNumber(num: number): string {
  return num.toLocaleString();
}

export function getAgencyDisplayName(agency: Agency): string {
  const agencyNames: Record<Agency, string> = {
    EXECUTIVE: 'Executive Branch',
    LEGISLATIVE: 'Legislative Branch',
    CONSTITUTIONAL_COMMISSION: 'Constitutional Commissions',
    JUDICIARY: 'Judiciary'
  };
  return agencyNames[agency];
}

export function groupOfficialsByStatusAndAgency<T extends Official>(officials: T[]) {
  const grouped: Record<'active' | 'inactive', Record<Agency, T[]>> = {
    active: {
      EXECUTIVE: [],
      LEGISLATIVE: [],
      CONSTITUTIONAL_COMMISSION: [],
      JUDICIARY: []
    },
    inactive: {
      EXECUTIVE: [],
      LEGISLATIVE: [],
      CONSTITUTIONAL_COMMISSION: [],
      JUDICIARY: []
    }
  };

  officials.forEach(official => {
    grouped[official.status][official.agency].push(official);
  });

  return grouped;
}

/** Presentation compatibility only. Legacy values are not reviewed archive evidence. */
export function getOfficialWithSALNData(official: Official) {
  const saln_records = official.saln_records || [];
  const latest_saln_year = saln_records.length
    ? Math.max(...saln_records.map(record => record.year))
    : undefined;
  return {
    ...official,
    saln_count: saln_records.length,
    latest_saln_year,
    latest_saln_record: saln_records.find(record => record.year === latest_saln_year)
  };
}
