import { collection, getDocs, doc, getDoc, getDocsFromCache, getDocsFromServer, getDocFromCache, getDocFromServer } from 'firebase/firestore';
import { db } from '../lib/firebase';
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

/**
 * Fetch all officials from Firestore
 * Uses Firestore's built-in cache (IndexedDB) automatically
 * @param source - 'default' (cache-first), 'server' (force network), or 'cache' (cache-only)
 */
async function loadOfficials(source: 'default' | 'server' | 'cache' = 'default'): Promise<Official[]> {
  try {
    const officialsCollection = collection(db, 'officials');
    let querySnapshot;

    // Use Firestore's built-in cache management
    if (source === 'cache') {
      // Try cache only (offline-first)
      querySnapshot = await getDocsFromCache(officialsCollection);
    } else if (source === 'server') {
      // Force fetch from server
      querySnapshot = await getDocsFromServer(officialsCollection);
    } else {
      // Default: cache-first, then server (automatic behavior)
      querySnapshot = await getDocs(officialsCollection);
    }
    
    const officials: Official[] = [];
    querySnapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data();
      const official = validateOfficial(data);
      if (official) {
        officials.push(official);
      }
    });

    return officials;
  } catch (error) {
    console.error('Error loading officials from Firestore:', error);
    
    // If server fetch fails and we weren't already trying cache, try cache as fallback
    if (source === 'server') {
      try {
        const officialsCollection = collection(db, 'officials');
        const cacheSnapshot = await getDocsFromCache(officialsCollection);
        const officials: Official[] = [];
        cacheSnapshot.forEach((docSnapshot) => {
          const data = docSnapshot.data();
          const official = validateOfficial(data);
          if (official) {
            officials.push(official);
          }
        });
        return officials;
      } catch (cacheError) {
        console.error('Cache fallback also failed:', cacheError);
      }
    }
    
    return [];
  }
}

/**
 * Type guard: Validates Firestore data matches Official interface
 * Uses constants derived from type definitions - no enum duplication
 */
function validateOfficial(data: any, id: string): Official | null {
  if (!data.name || !VALID_AGENCIES.includes(data.agency) || !VALID_STATUSES.includes(data.status)) {
    return null;
  }

  const official: Official = {
    slug: data.slug || id,
    name: data.name,
    position: data.position,
    agency: data.agency,
    status: data.status,
    term_start: data.term_start,
    term_end: data.term_end,
    saln_records: data.saln_records || []
  };

  return official;
}

/**
 * Get all officials
 * @param forceRefresh - If true, fetches fresh data from server bypassing cache
 */
export async function getOfficials(forceRefresh: boolean = false): Promise<Official[]> {
  return loadOfficials(forceRefresh ? 'server' : 'default');
}

/**
 * Find an official by their slug
 * Uses Firestore's built-in cache (cache-first by default)
 * @param slug - The official's slug
 * @param source - 'default' (cache-first), 'server' (force network), or 'cache' (cache-only)
 */
export async function findOfficialBySlug(
  slug: string,
  source: 'default' | 'server' | 'cache' = 'default'
): Promise<Official | undefined> {
  try {
    const docRef = doc(db, 'officials', slug);
    let docSnap;

    // Use Firestore's built-in cache management
    if (source === 'cache') {
      docSnap = await getDocFromCache(docRef);
    } else if (source === 'server') {
      docSnap = await getDocFromServer(docRef);
    } else {
      // Default: cache-first, then server
      docSnap = await getDoc(docRef);
    }
    
    if (docSnap.exists()) {
      const data = docSnap.data() as Official;
      return {
        ...data,
        slug: data.slug || docSnap.id,
        saln_records: data.saln_records || []
      };
    }
    
    return undefined;
  } catch (error) {
    console.error(`Error loading official by slug ${slug}:`, error);
    
    // If server fetch fails and we weren't already trying cache, try cache as fallback
    if (source === 'server') {
      try {
        const docRef = doc(db, 'officials', slug);
        const cacheSnap = await getDocFromCache(docRef);
        if (cacheSnap.exists()) {
          const data = cacheSnap.data() as Official;
          return {
            ...data,
            slug: data.slug || cacheSnap.id,
            saln_records: data.saln_records || []
          };
        }
      } catch (cacheError) {
        console.error('Cache fallback also failed:', cacheError);
      }
    }
    
    return undefined;
  }
}

/**
 * Get a single official by slug
 * Alias for findOfficialBySlug for backward compatibility
 */
export async function getOfficialBySlug(slug: string): Promise<Official | null> {
  return await findOfficialBySlug(slug) || null;
}

/**
 * Get all SALN records (flattened from all officials)
 * This maintains backward compatibility with code expecting all records
 */
export async function getSALNRecords(): Promise<SALNRecord[]> {
  const allOfficials = await loadOfficials();
  const allRecords: SALNRecord[] = [];
  
  for (const official of allOfficials) {
    if (official.saln_records && official.saln_records.length > 0) {
      allRecords.push(...official.saln_records);
    }
  }
  
  return allRecords;
}

/**
 * Get SALN records for a specific official by slug
 */
export async function getSALNRecordsForOfficial(slug: string): Promise<SALNRecord[]> {
  try {
    const official = await findOfficialBySlug(slug);
    return official?.saln_records || [];
  } catch (error) {
    console.error(`Error loading SALN records for slug ${slug}:`, error);
    return [];
  }
}

/**
 * Get the latest SALN year for an official
 */
export async function getLatestSALNYear(slug: string): Promise<number | undefined> {
  const records = await getSALNRecordsForOfficial(slug);
  if (records.length === 0) return undefined;

  return Math.max(...records.map(record => record.year));
}

/**
 * Get SALN record count for an official
 */
export async function getSALNRecordCount(slug: string): Promise<number> {
  const records = await getSALNRecordsForOfficial(slug);
  return records.length;
}

/**
 * Get the latest SALN record for an official
 */
export async function getLatestSALNRecord(slug: string): Promise<SALNRecord | undefined> {
  const records = await getSALNRecordsForOfficial(slug);
  if (records.length === 0) return undefined;

  const latestYear = Math.max(...records.map(record => record.year));
  return records.find(record => record.year === latestYear);
}

/**
 * Get an official with their SALN data computed
 */
export async function getOfficialWithSALNData(official: Official) {
  const saln_records = official.saln_records || [];
  const saln_count = saln_records.length;
  const latest_saln_year = saln_count > 0 
    ? Math.max(...saln_records.map(record => record.year))
    : undefined;
  const latest_saln_record = saln_count > 0
    ? saln_records.find(record => record.year === latest_saln_year)
    : undefined;

  return {
    ...official,
    saln_count,
    latest_saln_year,
    latest_saln_record
  };
}

/**
 * Get all officials with their SALN data computed
 */
export async function getOfficialsWithSALNData() {
  const allOfficials = await loadOfficials();
  const officialsWithSALN = allOfficials.map(official => {
    const saln_records = official.saln_records || [];
    const saln_count = saln_records.length;
    const latest_saln_year = saln_count > 0 
      ? Math.max(...saln_records.map(record => record.year))
      : undefined;
    const latest_saln_record = saln_count > 0
      ? saln_records.find(record => record.year === latest_saln_year)
      : undefined;

    return {
      ...official,
      saln_count,
      latest_saln_year,
      latest_saln_record
    };
  });
  
  return officialsWithSALN;
}
