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

export type Agency = 'EXECUTIVE' | 'LEGISLATIVE' | 'CONSTITUTIONAL_COMMISSION' | 'JUDICIARY';

export interface Official {
  id: string;
  name: string;
  position: string;
  agency: Agency;
  status: 'active' | 'inactive';
  term_start?: string;
  term_end?: string;
  slug?: string;
}

export function generateSlug(official: Official): string {
  const name = official.name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
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

export function formatNumber(num: number): string {
  return num.toLocaleString();
}

export function findOfficialBySlug(slug: string): Official | undefined {
  return officials.find(official => generateSlug(official) === slug);
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

export const officials: Official[] = [
  {
    id: 'pres-001',
    name: 'Ferdinand "Bongbong" Romualdez Marcos Jr.',
    position: 'President',
    agency: 'EXECUTIVE',
    status: 'active',
    term_start: '2022-06-30',
    term_end: '2028-06-30'
  },
  {
    id: 'vp-001',
    name: 'Sara Zimmerman Duterte',
    position: 'Vice President',
    agency: 'EXECUTIVE',
    status: 'active',
    term_start: '2022-06-30',
    term_end: '2028-06-30'
  },
  {
    id: 'sen-001',
    name: 'Alan Peter Cayetano',
    position: 'Senator',
    agency: 'LEGISLATIVE',
    status: 'active',
    term_start: '2022-06-30',
    term_end: '2028-06-29'
  },
  {
    id: 'sen-002',
    name: 'JV Ejercito',
    position: 'Senator',
    agency: 'LEGISLATIVE',
    status: 'active',
    term_start: '2022-06-30',
    term_end: '2028-06-29'
  },
  {
    id: 'sen-003',
    name: 'Francis Escudero',
    position: 'Senator',
    agency: 'LEGISLATIVE',
    status: 'active',
    term_start: '2022-06-30',
    term_end: '2028-06-29'
  },
  {
    id: 'sen-004',
    name: 'Jinggoy Estrada',
    position: 'Senator',
    agency: 'LEGISLATIVE',
    status: 'active',
    term_start: '2022-06-30',
    term_end: '2028-06-29'
  },
  {
    id: 'sen-005',
    name: 'Win Gatchalian',
    position: 'Senator',
    agency: 'LEGISLATIVE',
    status: 'active',
    term_start: '2022-06-30',
    term_end: '2028-06-29'
  },
  {
    id: 'sen-006',
    name: 'Risa Hontiveros',
    position: 'Senator',
    agency: 'LEGISLATIVE',
    status: 'active',
    term_start: '2022-06-30',
    term_end: '2028-06-29'
  },
  {
    id: 'sen-007',
    name: 'Loren Legarda',
    position: 'Senator',
    agency: 'LEGISLATIVE',
    status: 'active',
    term_start: '2022-06-30',
    term_end: '2028-06-29'
  },
  {
    id: 'sen-008',
    name: 'Robin Padilla',
    position: 'Senator',
    agency: 'LEGISLATIVE',
    status: 'active',
    term_start: '2022-06-30',
    term_end: '2028-06-29'
  },
  {
    id: 'sen-009',
    name: 'Raffy Tulfo',
    position: 'Senator',
    agency: 'LEGISLATIVE',
    status: 'active',
    term_start: '2022-06-30',
    term_end: '2028-06-29'
  },
  {
    id: 'sen-010',
    name: 'Joel Villanueva',
    position: 'Senator',
    agency: 'LEGISLATIVE',
    status: 'active',
    term_start: '2022-06-30',
    term_end: '2028-06-29'
  },
  {
    id: 'sen-011',
    name: 'Mark Villar',
    position: 'Senator',
    agency: 'LEGISLATIVE',
    status: 'active',
    term_start: '2022-06-30',
    term_end: '2028-06-29'
  },
  {
    id: 'sen-012',
    name: 'Juan Miguel Zubiri',
    position: 'Senator',
    agency: 'LEGISLATIVE',
    status: 'active',
    term_start: '2022-06-30',
    term_end: '2028-06-29'
  },
  {
    id: 'sen-013',
    name: 'Bong Go',
    position: 'Senator',
    agency: 'LEGISLATIVE',
    status: 'active',
    term_start: '2025-06-30',
    term_end: '2031-06-29'
  },
  {
    id: 'sen-014',
    name: 'Bam Aquino',
    position: 'Senator',
    agency: 'LEGISLATIVE',
    status: 'active',
    term_start: '2025-06-30',
    term_end: '2031-06-29'
  },
  {
    id: 'sen-015',
    name: 'Ronald "Bato" dela Rosa',
    position: 'Senator',
    agency: 'LEGISLATIVE',
    status: 'active',
    term_start: '2025-06-30',
    term_end: '2031-06-29'
  },
  {
    id: 'sen-016',
    name: 'Erwin Tulfo',
    position: 'Senator',
    agency: 'LEGISLATIVE',
    status: 'active',
    term_start: '2025-06-30',
    term_end: '2031-06-29'
  },
  {
    id: 'sen-017',
    name: 'Kiko Pangilinan',
    position: 'Senator',
    agency: 'LEGISLATIVE',
    status: 'active',
    term_start: '2025-06-30',
    term_end: '2031-06-29'
  },
  {
    id: 'sen-018',
    name: 'Rodante Marcoleta',
    position: 'Senator',
    agency: 'LEGISLATIVE',
    status: 'active',
    term_start: '2025-06-30',
    term_end: '2031-06-29'
  },
  {
    id: 'sen-019',
    name: 'Panfilo Lacson',
    position: 'Senator',
    agency: 'LEGISLATIVE',
    status: 'active',
    term_start: '2025-06-30',
    term_end: '2031-06-29'
  },
  {
    id: 'sen-020',
    name: 'Tito Sotto',
    position: 'Senator',
    agency: 'LEGISLATIVE',
    status: 'active',
    term_start: '2025-06-30',
    term_end: '2031-06-29'
  },
  {
    id: 'sen-021',
    name: 'Pia Cayetano',
    position: 'Senator',
    agency: 'LEGISLATIVE',
    status: 'active',
    term_start: '2025-06-30',
    term_end: '2031-06-29'
  },
  {
    id: 'sen-022',
    name: 'Camille Villar',
    position: 'Senator',
    agency: 'LEGISLATIVE',
    status: 'active',
    term_start: '2025-06-30',
    term_end: '2031-06-29'
  },
  {
    id: 'sen-023',
    name: 'Lito Lapid',
    position: 'Senator',
    agency: 'LEGISLATIVE',
    status: 'active',
    term_start: '2025-06-30',
    term_end: '2031-06-29'
  },
  {
    id: 'sen-024',
    name: 'Imee Marcos',
    position: 'Senator',
    agency: 'LEGISLATIVE',
    status: 'active',
    term_start: '2025-06-30',
    term_end: '2031-06-29'
  },
  {
    id: 'comelec-001',
    name: 'George Erwin M. Garcia',
    position: 'Chairman, Commission on Elections',
    agency: 'CONSTITUTIONAL_COMMISSION',
    status: 'active',
    term_start: '2022-02-04',
    term_end: '2029-02-04'
  },
  {
    id: 'comelec-002',
    name: 'Aimee Ferolino-Ampoloquio',
    position: 'Commissioner, Commission on Elections',
    agency: 'CONSTITUTIONAL_COMMISSION',
    status: 'active',
    term_start: '2015-02-02',
    term_end: '2029-02-02'
  },
  {
    id: 'comelec-003',
    name: 'Rey E. Bulay',
    position: 'Commissioner, Commission on Elections',
    agency: 'CONSTITUTIONAL_COMMISSION',
    status: 'active',
    term_start: '2021-10-12',
    term_end: '2028-02-02'
  },
  {
    id: 'comelec-004',
    name: 'Aimee Torrefranca-Neri',
    position: 'Commissioner, Commission on Elections',
    agency: 'CONSTITUTIONAL_COMMISSION',
    status: 'active',
    term_start: '2022-02-14',
    term_end: '2029-02-02'
  },
  {
    id: 'comelec-005',
    name: 'Nelson S. Celis',
    position: 'Commissioner, Commission on Elections',
    agency: 'CONSTITUTIONAL_COMMISSION',
    status: 'active',
    term_start: '2024-02-07',
    term_end: '2031-02-02'
  },
  {
    id: 'comelec-006',
    name: 'Ernesto Ferdinand F. Maceda Jr.',
    position: 'Commissioner, Commission on Elections',
    agency: 'CONSTITUTIONAL_COMMISSION',
    status: 'active',
    term_start: '2024-05-16',
    term_end: '2031-02-02'
  },
  {
    id: 'coa-001',
    name: 'Gamaliel A. Cordoba',
    position: 'Chairman, Commission on Audit',
    agency: 'CONSTITUTIONAL_COMMISSION',
    status: 'active',
    term_start: '2021-02-25',
    term_end: '2028-02-02'
  },
  {
    id: 'csc-001',
    name: 'Karlo Alexei B. Nograles',
    position: 'Chairman, Civil Service Commission',
    agency: 'CONSTITUTIONAL_COMMISSION',
    status: 'active',
    term_start: '2022-02-14',
    term_end: '2029-02-02'
  },
  {
    id: 'chr-001',
    name: 'Richard P. Palpal-latoc',
    position: 'Chairman, Commission on Human Rights',
    agency: 'CONSTITUTIONAL_COMMISSION',
    status: 'active',
    term_start: '2015-08-04',
    term_end: '2022-08-04'
  },
  {
    id: 'omb-001',
    name: 'Samuel R. Martires',
    position: 'Ombudsman',
    agency: 'CONSTITUTIONAL_COMMISSION',
    status: 'active',
    term_start: '2021-08-03',
    term_end: '2028-08-03'
  },
  {
    id: 'pres-former-001',
    name: 'Rodrigo Roa Duterte',
    position: 'Former President',
    agency: 'EXECUTIVE',
    status: 'inactive',
    term_start: '2016-06-30',
    term_end: '2022-06-30'
  },
  {
    id: 'vp-former-001',
    name: 'Maria Leonor "Leni" Gerona Robredo',
    position: 'Former Vice President',
    agency: 'EXECUTIVE',
    status: 'inactive',
    term_start: '2016-06-30',
    term_end: '2022-06-30'
  },
  {
    id: 'pres-former-002',
    name: 'Benigno Simeon "Noynoy" Cojuangco Aquino III',
    position: 'Former President',
    agency: 'EXECUTIVE',
    status: 'inactive',
    term_start: '2010-06-30',
    term_end: '2016-06-30'
  },
  {
    id: 'sen-former-001',
    name: 'Leila de Lima',
    position: 'Former Senator',
    agency: 'LEGISLATIVE',
    status: 'inactive',
    term_start: '2016-06-30',
    term_end: '2022-06-30'
  },
  {
    id: 'sen-former-002',
    name: 'Antonio Trillanes IV',
    position: 'Former Senator',
    agency: 'LEGISLATIVE',
    status: 'inactive',
    term_start: '2007-06-30',
    term_end: '2019-06-30'
  },
  {
    id: 'sen-former-003',
    name: 'Miriam Defensor Santiago',
    position: 'Former Senator',
    agency: 'LEGISLATIVE',
    status: 'inactive',
    term_start: '1995-06-30',
    term_end: '2016-09-29'
  }
];

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

let salnDataCache: SALNRecord[] | null = null;

async function loadSALNRecords(): Promise<SALNRecord[]> {
  if (salnDataCache) {
    return salnDataCache;
  }

  try {
    let baseUrl: string;

    if (typeof window !== 'undefined') {
      baseUrl = window.location.origin;
    } else {
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
    return [];
  }
}

export const getSALNRecords = loadSALNRecords;

export async function getSALNRecordsForOfficial(officialId: string): Promise<SALNRecord[]> {
  const allRecords = await getSALNRecords();
  return allRecords.filter(record => record.official_id === officialId);
}

export async function getLatestSALNYear(officialId: string): Promise<number | undefined> {
  const records = await getSALNRecordsForOfficial(officialId);
  if (records.length === 0) return undefined;

  return Math.max(...records.map(record => record.year));
}

export async function getSALNRecordCount(officialId: string): Promise<number> {
  const records = await getSALNRecordsForOfficial(officialId);
  return records.length;
}

export async function getLatestSALNRecord(officialId: string): Promise<SALNRecord | undefined> {
  const records = await getSALNRecordsForOfficial(officialId);
  if (records.length === 0) return undefined;

  const latestYear = Math.max(...records.map(record => record.year));
  return records.find(record => record.year === latestYear);
}

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

export async function getOfficialsWithSALNData() {
  const allOfficials = await Promise.all(
    officials.map(official => getOfficialWithSALNData(official))
  );
  return allOfficials;
}
