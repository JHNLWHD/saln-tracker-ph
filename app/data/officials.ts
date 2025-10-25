// SALN Record types
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
  id: string;
  official_id: string;
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

export interface Official {
  id: string;
  name: string;
  position: 'PRESIDENT' | 'VICE PRESIDENT' | 'SENATOR';
  status: 'active' | 'inactive';
  slug?: string;
}

// Utility function to generate URL-friendly slugs
export function generateSlug(official: Official): string {
  const name = official.name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .trim();

  return name;
}

import currency from 'currency.js';

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

// Utility function to format large numbers with commas
export function formatNumber(num: number): string {
  return num.toLocaleString();
}

// Function to find official by slug
export function findOfficialBySlug(slug: string): Official | undefined {
  return officials.find(official => generateSlug(official) === slug);
}

export const officials: Official[] = [
  // PRESIDENT
  {
    id: 'pres-001',
    name: 'Ferdinand "Bongbong" Romualdez Marcos Jr.',
    position: 'PRESIDENT',
    status: 'active'
  },

  // VICE PRESIDENT
  {
    id: 'vp-001',
    name: 'Sara Zimmerman Duterte',
    position: 'VICE PRESIDENT',
    status: 'active'
  },

  // SENATORS (Term 2022-2028)
  {
    id: 'sen-001',
    name: 'Alan Peter Cayetano',
    position: 'SENATOR',
    status: 'active'
  },
  {
    id: 'sen-002',
    name: 'JV Ejercito',
    position: 'SENATOR',
    status: 'active'
  },
  {
    id: 'sen-003',
    name: 'Francis Escudero',
    position: 'SENATOR',
    status: 'active'
  },
  {
    id: 'sen-004',
    name: 'Jinggoy Estrada',
    position: 'SENATOR',
    status: 'active'
  },
  {
    id: 'sen-005',
    name: 'Win Gatchalian',
    position: 'SENATOR',
    status: 'active'
  },
  {
    id: 'sen-006',
    name: 'Risa Hontiveros',
    position: 'SENATOR',
    status: 'active'
  },
  {
    id: 'sen-007',
    name: 'Loren Legarda',
    position: 'SENATOR',
    status: 'active'
  },
  {
    id: 'sen-008',
    name: 'Robin Padilla',
    position: 'SENATOR',
    status: 'active'
  },
  {
    id: 'sen-009',
    name: 'Raffy Tulfo',
    position: 'SENATOR',
    status: 'active'
  },
  {
    id: 'sen-010',
    name: 'Joel Villanueva',
    position: 'SENATOR',
    status: 'active'
  },
  {
    id: 'sen-011',
    name: 'Mark Villar',
    position: 'SENATOR',
    status: 'active'
  },
  {
    id: 'sen-012',
    name: 'Juan Miguel Zubiri',
    position: 'SENATOR',
    status: 'active'
  },

  // SENATORS (Term 2025-2031)
  {
    id: 'sen-013',
    name: 'Bong Go',
    position: 'SENATOR',
    status: 'active'
  },
  {
    id: 'sen-014',
    name: 'Bam Aquino',
    position: 'SENATOR',
    status: 'active'
  },
  {
    id: 'sen-015',
    name: 'Ronald "Bato" dela Rosa',
    position: 'SENATOR',
    status: 'active'
  },
  {
    id: 'sen-016',
    name: 'Erwin Tulfo',
    position: 'SENATOR',
    status: 'active'
  },
  {
    id: 'sen-017',
    name: 'Kiko Pangilinan',
    position: 'SENATOR',
    status: 'active'
  },
  {
    id: 'sen-018',
    name: 'Rodante Marcoleta',
    position: 'SENATOR',
    status: 'active'
  },
  {
    id: 'sen-019',
    name: 'Panfilo Lacson',
    position: 'SENATOR',
    status: 'active'
  },
  {
    id: 'sen-020',
    name: 'Tito Sotto',
    position: 'SENATOR',
    status: 'active'
  },
  {
    id: 'sen-021',
    name: 'Pia Cayetano',
    position: 'SENATOR',
    status: 'active'
  },
  {
    id: 'sen-022',
    name: 'Camille Villar',
    position: 'SENATOR',
    status: 'active'
  },
  {
    id: 'sen-023',
    name: 'Lito Lapid',
    position: 'SENATOR',
    status: 'active'
  },
  {
    id: 'sen-024',
    name: 'Imee Marcos',
    position: 'SENATOR',
    status: 'active'
  }
];

// SALN Data interface for JSON structure
interface SALNDataFile {
  metadata: {
    version: string;
    last_updated: string;
    total_records: number;
    source: string;
    description: string;
  };
  records: SALNRecord[];
}

// Cache for SALN data to avoid repeated fetches
let salnDataCache: SALNRecord[] | null = null;

// Function to load SALN records from JSON file
async function loadSALNRecords(): Promise<SALNRecord[]> {
  if (salnDataCache) {
    return salnDataCache;
  }

  try {
    // Determine the base URL for fetching
    let baseUrl: string;

    if (typeof window !== 'undefined') {
      // Client-side: use current origin
      baseUrl = window.location.origin;
    } else {
      // Server-side: use environment variable or default to production URL
      baseUrl =
        import.meta.env.VITE_SITE_URL || "https://saln-tracker-ph.netlify.app";
    }

    const response = await fetch(`${baseUrl}/saln-records.json`);
    if (!response.ok) {
      throw new Error(`Failed to load SALN data: ${response.status}`);
    }

    const salnData: SALNDataFile = await response.json();
    salnDataCache = salnData.records;
    return salnDataCache;
  } catch (error) {
    console.error('Error loading SALN records:', error);
    // Return empty array as fallback
    return [];
  }
}

// Export a function that returns a promise for SALN records
export const getSALNRecords = loadSALNRecords;

// Helper function to get SALN records for a specific official - now async
export async function getSALNRecordsForOfficial(officialId: string): Promise<SALNRecord[]> {
  const allRecords = await getSALNRecords();
  return allRecords.filter(record => record.official_id === officialId);
}

// Helper function to get the latest SALN year for an official - now async
export async function getLatestSALNYear(officialId: string): Promise<number | undefined> {
  const records = await getSALNRecordsForOfficial(officialId);
  if (records.length === 0) return undefined;

  return Math.max(...records.map(record => record.year));
}

// Helper function to count SALN records for an official - now async
export async function getSALNRecordCount(officialId: string): Promise<number> {
  const records = await getSALNRecordsForOfficial(officialId);
  return records.length;
}

// Helper function to get the latest SALN record for an official - now async
export async function getLatestSALNRecord(officialId: string): Promise<SALNRecord | undefined> {
  const records = await getSALNRecordsForOfficial(officialId);
  if (records.length === 0) return undefined;

  const latestYear = Math.max(...records.map(record => record.year));
  return records.find(record => record.year === latestYear);
}

// Helper function to get computed values for officials - now async
export async function getOfficialWithSALNData(official: Official) {
  const saln_count = await getSALNRecordCount(official.id);
  const latest_saln_year = await getLatestSALNYear(official.id);
  const latest_saln_record = await getLatestSALNRecord(official.id);

  return {
    ...official,
    saln_count,
    latest_saln_year,
    latest_saln_record
  };
}

// Get all officials with computed SALN data - now async
export async function getOfficialsWithSALNData() {
  const allOfficials = await Promise.all(
    officials.map(official => getOfficialWithSALNData(official))
  );
  return allOfficials;
}
