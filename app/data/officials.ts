// SALN Record types
export interface Asset {
  description: string;
  value: number;
  category: 'Real Property' | 'Personal Property' | 'Investments';
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
  const position = official.position.toLowerCase().replace(' ', '-');
  const name = official.name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .trim();
  
  return `${position}-${name}`;
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

// SALN Records data - currently empty but ready for real data
export const salnRecords: SALNRecord[] = [];

// Helper function to get SALN records for a specific official
export function getSALNRecordsForOfficial(officialId: string): SALNRecord[] {
  return salnRecords.filter(record => record.official_id === officialId);
}

// Helper function to get the latest SALN year for an official
export function getLatestSALNYear(officialId: string): number | undefined {
  const records = getSALNRecordsForOfficial(officialId);
  if (records.length === 0) return undefined;
  
  return Math.max(...records.map(record => record.year));
}

// Helper function to count SALN records for an official
export function getSALNRecordCount(officialId: string): number {
  return getSALNRecordsForOfficial(officialId).length;
}

// Helper function to get computed values for officials
export function getOfficialWithSALNData(official: Official) {
  return {
    ...official,
    saln_count: getSALNRecordCount(official.id),
    latest_saln_year: getLatestSALNYear(official.id)
  };
}

// Get all officials with computed SALN data
export function getOfficialsWithSALNData() {
  return officials.map(getOfficialWithSALNData);
}
