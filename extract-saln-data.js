// Script to extract SALN data from officials.ts and convert to JSON
const fs = require('fs');

// Read the current officials.ts file
const officialsContent = fs.readFileSync('app/data/officials.ts', 'utf8');

// Extract the salnRecords array content
const salnRecordsMatch = officialsContent.match(/export const salnRecords: SALNRecord\[\] = \[([\s\S]*?)\];/);

if (!salnRecordsMatch) {
  console.error('Could not find salnRecords array');
  process.exit(1);
}

// Clean up the extracted content and convert to proper JSON format
let salnRecordsContent = salnRecordsMatch[1];

// Remove TypeScript-style comments
salnRecordsContent = salnRecordsContent.replace(/\/\/ [^\n]*\n/g, '');

// Remove trailing commas and fix formatting
salnRecordsContent = salnRecordsContent.replace(/,(\s*[\]}])/g, '$1');

// Wrap in array brackets and create valid JSON
const jsonContent = `[${salnRecordsContent}]`;

// Parse to validate JSON and get proper formatting
try {
  const parsedData = JSON.parse(jsonContent);
  
  // Create metadata object
  const salnData = {
    metadata: {
      version: "1.0",
      last_updated: new Date().toISOString(),
      total_records: parsedData.length,
      source: "SALN Tracker Philippines - Aggregated from official government sources",
      description: "Statement of Assets, Liabilities, and Net Worth records for Philippine public officials"
    },
    records: parsedData
  };
  
  // Write to public folder
  fs.writeFileSync('public/saln-records.json', JSON.stringify(salnData, null, 2));
  
  console.log(`✅ Successfully created public/saln-records.json with ${parsedData.length} records`);
  
  // Show summary statistics
  const officialCounts = {};
  parsedData.forEach(record => {
    const prefix = record.official_id.split('-')[0];
    officialCounts[prefix] = (officialCounts[prefix] || 0) + 1;
  });
  
  console.log('📊 Records by type:');
  Object.entries(officialCounts).forEach(([type, count]) => {
    const label = type === 'pres' ? 'President' : type === 'vp' ? 'Vice President' : 'Senators';
    console.log(`   ${label}: ${count} records`);
  });
  
} catch (error) {
  console.error('❌ Error parsing JSON:', error.message);
  console.log('Content preview:', jsonContent.substring(0, 500));
  process.exit(1);
}
