import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Firebase configuration
const firebaseConfig = {
  projectId: "saln-tracker-ph",
  // Note: For local development/migration, you may need to set GOOGLE_APPLICATION_CREDENTIALS
  // environment variable pointing to your service account key
};

// Initialize Firebase Admin
admin.initializeApp(firebaseConfig);
const db = admin.firestore();

// Generate slug from official name (same logic as app/data/officials.ts)
function generateSlug(official) {
  const name = official.name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();

  return name;
}

// Read officials data from TypeScript file (converted to static data)
const officials = [
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

// Read SALN records from JSON file
const salnDataPath = join(__dirname, 'public', 'saln-records.json');
const salnDataFile = JSON.parse(readFileSync(salnDataPath, 'utf-8'));
const salnRecords = salnDataFile.records;

// Group SALN records by official_id
function groupSALNsByOfficial(records) {
  const grouped = {};
  
  for (const record of records) {
    if (!grouped[record.official_id]) {
      grouped[record.official_id] = [];
    }
    
    // Remove the id and official_id fields as they're redundant in nested structure
    const { id, official_id, ...salnData } = record;
    grouped[record.official_id].push(salnData);
  }
  
  // Sort SALNs by year (descending)
  for (const officialId in grouped) {
    grouped[officialId].sort((a, b) => b.year - a.year);
  }
  
  return grouped;
}

async function migrateOfficialsWithSALNs() {
  console.log(`\n📋 Migrating ${officials.length} officials with nested SALN records...`);
  console.log(`   Using slug-based document IDs for SEO-friendly URLs\n`);
  
  const salnsByOfficial = groupSALNsByOfficial(salnRecords);
  
  const batch = db.batch();
  let officialCount = 0;
  let totalSALNs = 0;

  for (const official of officials) {
    const officialSALNs = salnsByOfficial[official.id] || [];
    
    // Generate slug for document ID
    const slug = generateSlug(official);
    
    // Remove id field and use slug as primary identifier
    const { id, ...officialWithoutId } = official;
    
    const officialData = {
      ...officialWithoutId,
      slug, // slug is now the primary identifier
      saln_records: officialSALNs
    };
    
    // Use slug as document ID
    const docRef = db.collection('officials').doc(slug);
    batch.set(docRef, officialData);
    
    officialCount++;
    totalSALNs += officialSALNs.length;
    
    if (officialCount % 10 === 0) {
      console.log(`  ✓ Prepared ${officialCount}/${officials.length} officials (${totalSALNs} SALNs so far)`);
    }
    
    // Log first few examples
    if (officialCount <= 3) {
      console.log(`     Example: ${official.name} → ${slug}`);
    }
  }

  await batch.commit();
  console.log(`\n✅ Successfully migrated ${officialCount} officials with ${totalSALNs} SALN records!`);
  console.log(`   Document IDs are now slugs (e.g., "ferdinand-bongbong-romualdez-marcos-jr")\n`);
}

async function migrate() {
  try {
    console.log('\n🚀 Starting Firestore Migration (Slug-based Document IDs)...\n');
    console.log('⚠️  Make sure you have set GOOGLE_APPLICATION_CREDENTIALS environment variable');
    console.log('   pointing to your Firebase service account key JSON file.\n');
    
    await migrateOfficialsWithSALNs();
    
    console.log('✨ Migration completed successfully!\n');
    console.log('📊 Data Structure:');
    console.log('   Collection: officials/{slug}');
    console.log('   - Document ID: Generated from official name (slug format)');
    console.log('   - Official fields (id, name, position, slug, etc.)');
    console.log('   - saln_records: array of SALN objects\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrate();
