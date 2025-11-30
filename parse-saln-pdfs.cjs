const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

const salnDirectory = './public/saln';
const outputFile = './public/saln-records.json';

const officialMapping = {
  'President Ferdinand Marcos Jr.': 'pres-001',
  'Vice President Sara Duterte': 'vp-001',
  'Former President Rodrigo Duterte': 'pres-former-001',
  'COA Chair Cordoba': 'coa-001',
  'COA Commissioner Lipana': 'coa-002',
  'COA Commissioner Malilin': 'coa-003',
  'COMELEC Chair Garcia': 'comelec-001',
  'COMELEC Commissioner Aimee Ferolino': 'comelec-002',
  'COMELEC Commissioner Rey Bulay': 'comelec-003',
  'COMELEC Commissioner Ernesto Maceda': 'comelec-006',
  'COMELEC Commissioner Nelson Celis': 'comelec-005',
  'COMELEC Commissioner Casingal': 'comelec-007',
  'COMELEC Commissioner Pipo': 'comelec-008',
  'CSC Chair Barua-Yap': 'csc-002',
  'CSC Commissioner Acosta': 'csc-003',
  'CSC Commissioner Pangulayan': 'csc-004',
  'Former Ombudsman Samuel Martires': 'omb-001'
};

function extractNumberFromText(text) {
  const cleanText = text.replace(/,/g, '').replace(/₱/g, '').trim();
  const match = cleanText.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}

function extractYearFromFilename(filename) {
  const match = filename.match(/(\d{4})/);
  return match ? parseInt(match[1]) : null;
}

function parseNetWorthPatterns(text) {
  const patterns = [
    /NET\s*WORTH[:\s]+₱?\s*([\d,]+\.?\d*)/i,
    /NETWORTH[:\s]+₱?\s*([\d,]+\.?\d*)/i,
    /Net\s*Worth[:\s]+₱?\s*([\d,]+\.?\d*)/i,
    /TOTAL\s*NET\s*WORTH[:\s]+₱?\s*([\d,]+\.?\d*)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return extractNumberFromText(match[1]);
    }
  }
  return null;
}

function parseTotalAssetsPatterns(text) {
  const patterns = [
    /TOTAL\s*ASSETS[:\s]+₱?\s*([\d,]+\.?\d*)/i,
    /Total\s*Assets[:\s]+₱?\s*([\d,]+\.?\d*)/i,
    /ASSETS[:\s]+₱?\s*([\d,]+\.?\d*)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return extractNumberFromText(match[1]);
    }
  }
  return null;
}

function parseTotalLiabilitiesPatterns(text) {
  const patterns = [
    /TOTAL\s*LIABILITIES[:\s]+₱?\s*([\d,]+\.?\d*)/i,
    /Total\s*Liabilities[:\s]+₱?\s*([\d,]+\.?\d*)/i,
    /LIABILITIES[:\s]+₱?\s*([\d,]+\.?\d*)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return extractNumberFromText(match[1]);
    }
  }
  return null;
}

async function parsePDF(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    return data.text;
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error.message);
    return null;
  }
}

async function processSALNFiles() {
  const records = [];
  const directories = fs.readdirSync(salnDirectory);

  for (const dir of directories) {
    const dirPath = path.join(salnDirectory, dir);
    const stats = fs.statSync(dirPath);

    if (!stats.isDirectory()) continue;

    const officialId = officialMapping[dir];
    if (!officialId) {
      console.warn(`⚠️  No mapping found for: ${dir}`);
      continue;
    }

    console.log(`\n📁 Processing: ${dir}`);

    const files = fs.readdirSync(dirPath);
    const pdfFiles = files.filter(f => f.toLowerCase().endsWith('.pdf'));

    for (const pdfFile of pdfFiles) {
      const pdfPath = path.join(dirPath, pdfFile);
      const year = extractYearFromFilename(pdfFile);

      if (!year) {
        console.warn(`   ⚠️  Could not extract year from: ${pdfFile}`);
        continue;
      }

      console.log(`   📄 Parsing: ${pdfFile} (Year: ${year})`);

      const text = await parsePDF(pdfPath);
      if (!text) continue;

      const netWorth = parseNetWorthPatterns(text);
      const totalAssets = parseTotalAssetsPatterns(text);
      const totalLiabilities = parseTotalLiabilitiesPatterns(text);

      if (netWorth === null && totalAssets === null) {
        console.warn(`   ⚠️  Could not extract financial data from ${pdfFile}`);
        console.log(`   Preview: ${text.substring(0, 500)}...`);
        continue;
      }

      const record = {
        id: `saln-${officialId.replace(/-/g, '-')}-${year}`,
        official_id: officialId,
        year: year,
        net_worth: netWorth || (totalAssets || 0) - (totalLiabilities || 0),
        total_assets: totalAssets || 0,
        total_liabilities: totalLiabilities || 0,
        assets: [
          {
            description: 'Total Assets as reported',
            value: totalAssets || 0,
            source: 'As reported in SALN'
          }
        ],
        liabilities: [
          {
            creditor: 'As reported in SALN',
            nature: 'Total Liabilities as reported',
            balance: totalLiabilities || 0
          }
        ],
        date_filed: `${year}-12-31`,
        status: 'submitted',
        source_url: `/saln/${dir}/${pdfFile}`,
        source_description: `SALN PDF Document`
      };

      records.push(record);
      console.log(`   ✅ Extracted: Net Worth: ₱${netWorth?.toLocaleString() || 'N/A'}, Assets: ₱${totalAssets?.toLocaleString() || 'N/A'}, Liabilities: ₱${totalLiabilities?.toLocaleString() || 'N/A'}`);
    }
  }

  return records;
}

async function main() {
  console.log('🚀 Starting SALN PDF extraction...\n');

  let existingData = { metadata: {}, records: [] };
  
  if (fs.existsSync(outputFile)) {
    existingData = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
    console.log(`📖 Loaded ${existingData.records.length} existing records\n`);
  }

  const newRecords = await processSALNFiles();

  const existingRecordIds = new Set(existingData.records.map(r => r.id));
  const recordsToAdd = newRecords.filter(r => !existingRecordIds.has(r.id));
  const recordsToUpdate = newRecords.filter(r => existingRecordIds.has(r.id));

  existingData.records = existingData.records.filter(r => !newRecords.find(nr => nr.id === r.id));
  existingData.records.push(...newRecords);

  existingData.records.sort((a, b) => {
    if (a.official_id !== b.official_id) {
      return a.official_id.localeCompare(b.official_id);
    }
    return b.year - a.year;
  });

  existingData.metadata = {
    version: '2.0',
    last_updated: new Date().toISOString(),
    total_records: existingData.records.length,
    source: 'SALN Tracker Philippines - Aggregated from official government sources',
    description: 'Statement of Assets, Liabilities, and Net Worth records for Philippine public officials with source links'
  };

  fs.writeFileSync(outputFile, JSON.stringify(existingData, null, 2));

  console.log('\n✅ SALN extraction complete!');
  console.log(`📊 Summary:`);
  console.log(`   Total records: ${existingData.records.length}`);
  console.log(`   New records added: ${recordsToAdd.length}`);
  console.log(`   Records updated: ${recordsToUpdate.length}`);
  console.log(`\n💾 Output saved to: ${outputFile}`);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

