# Firestore Migration Guide

This document provides instructions for migrating SALN Tracker PH data to Firestore and deploying the security rules.

## Data Structure Overview

This migration uses a **nested structure** where SALN records are stored as an array inside each official's document, with **slug as the primary identifier** and document ID for SEO-friendly URLs. This provides:

- ✅ **Simpler queries**: Single read gets official + all SALNs
- ✅ **No composite indexes needed**: Better performance
- ✅ **Better data locality**: Related data stored together
- ✅ **Atomic updates**: Update official and SALNs in one operation
- ✅ **SEO-friendly URLs**: Document IDs match URL slugs (e.g., `/official/ferdinand-marcos-jr`)
- ✅ **Direct lookups**: Fast document retrieval by slug without querying
- ✅ **No redundant IDs**: Slug serves as both document ID and primary identifier

## Prerequisites

1. **Firebase CLI**: Install the Firebase CLI globally
   ```bash
   npm install -g firebase-tools
   ```

2. **Firebase Authentication**: Login to Firebase
   ```bash
   firebase login
   ```

3. **Service Account Key**: Download your Firebase service account key
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your project: `saln-tracker-ph`
   - Go to Project Settings > Service Accounts
   - Click "Generate New Private Key"
   - Save the JSON file securely (DO NOT commit to git)

## Migration Steps

### 1. Set Environment Variable

Point to your service account key file:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account-key.json"
```

### 2. Run Migration Script

Execute the migration script to import all officials with nested SALN records:

```bash
npm run migrate:firestore
```

This will:
- Import 43 officials to the `officials` collection
- Nest 78 SALN records inside their respective officials
- Sort SALNs by year (descending) within each official
- Display progress during migration

### 3. Initialize Firebase Project

If you haven't already, initialize Firebase in your project:

```bash
firebase init
```

Select:
- Firestore (use existing files)
- Use existing project: `saln-tracker-ph`

### 4. Deploy Firestore Rules

Deploy the security rules to allow read-only public access:

```bash
npm run deploy:firestore:rules
```

### 5. Deploy Firestore Indexes (Optional)

Since we're using a nested structure, no composite indexes are needed, but you can still deploy the empty indexes file:

```bash
npm run deploy:firestore:indexes
```

## Firestore Schema

### Collection: `officials`

Each document represents one official with their SALN records nested inside.

**Document ID**: Official's name in slug format (e.g., `ferdinand-bongbong-romualdez-marcos-jr`, `sara-zimmerman-duterte`)

**Structure**:
```javascript
{
  // Official metadata
  slug: "ferdinand-bongbong-romualdez-marcos-jr", // Primary identifier, same as document ID
  name: "Ferdinand Marcos Jr.",
  position: "President",
  agency: "EXECUTIVE", // EXECUTIVE | LEGISLATIVE | CONSTITUTIONAL_COMMISSION | JUDICIARY
  status: "active", // active | inactive
  term_start: "2022-06-30", // Optional
  term_end: "2028-06-30", // Optional
  
  // Nested SALN records (sorted by year DESC)
  saln_records: [
    {
      year: 2015,
      net_worth: 509751141.74,
      total_assets: 537164839.97,
      total_liabilities: 27413698.23,
      assets: [
        {
          description: "Total Assets as reported",
          value: 537164839.97,
          source: "As reported in SALN"
        }
      ],
      liabilities: [
        {
          creditor: "As reported in SALN",
          nature: "Total Liabilities as reported",
          balance: 27413698.23
        }
      ],
      date_filed: "2015-12-31",
      status: "submitted", // submitted | verified | under_review | flagged
      source_url: "https://example.com/source",
      source_description: "SlideShare Document"
    }
    // ... more SALN records
  ]
}
```

### SALN Record Fields

Each item in the `saln_records` array contains:

- `year` (number): SALN year
- `net_worth` (number): Net worth amount
- `total_assets` (number): Total assets
- `total_liabilities` (number): Total liabilities
- `assets` (array): Array of asset objects
  - `description` (string)
  - `value` (number)
  - `source` (string, optional)
- `liabilities` (array): Array of liability objects
  - `creditor` (string)
  - `nature` (string)
  - `balance` (number)
- `date_filed` (string): Filing date
- `status` (string): submitted | verified | under_review | flagged
- `source_url` (string, optional): Source URL
- `source_description` (string, optional): Source description

## Security Rules

The Firestore security rules provide:
- **Read-only public access** to the officials collection
- **No write access** to prevent unauthorized data modification

Rules defined in `firestore.rules`:

```
match /officials/{document=**} {
  allow read: if true;
  allow write: if false;
}
```

## Verification

After migration, verify the data in the Firebase Console:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select `saln-tracker-ph` project
3. Navigate to Firestore Database
4. Check the `officials` collection

You should see:
- 43 official documents
- Each with a `saln_records` array containing their SALN data
- SALNs sorted by year (most recent first)

## Testing Locally

The app should now fetch data from Firestore. Test locally:

```bash
npm run dev
```

Visit `http://localhost:5173` and verify:
- Officials are loading correctly
- SALN records are displayed for each official
- Navigation and filtering work as expected

## Data Access Patterns

The refactored data layer provides these functions:

```typescript
// Get all officials (with nested SALNs)
const officials = await getOfficials();

// Get a specific official by slug (direct document lookup - O(1))
const official = await findOfficialBySlug('ferdinand-bongbong-romualdez-marcos-jr');

// Get SALN records for an official (by slug)
const salns = await getSALNRecordsForOfficial('ferdinand-bongbong-romualdez-marcos-jr');

// Get computed SALN data (by slug)
const count = await getSALNRecordCount('ferdinand-bongbong-romualdez-marcos-jr');
const latestYear = await getLatestSALNYear('ferdinand-bongbong-romualdez-marcos-jr');
const latestRecord = await getLatestSALNRecord('ferdinand-bongbong-romualdez-marcos-jr');
```

**Performance Note**: All functions now use slug as the identifier. Since slug = document ID, lookups are direct and efficient (O(1) complexity).

## Troubleshooting

### Migration Script Errors

**Error**: "GOOGLE_APPLICATION_CREDENTIALS not set"
- **Solution**: Set the environment variable pointing to your service account key

**Error**: "Permission denied"
- **Solution**: Ensure your service account has Firestore Admin permissions

### Read Errors in App

**Error**: "Missing or insufficient permissions"
- **Solution**: Deploy security rules: `npm run deploy:firestore:rules`

**Error**: "Failed to get document"
- **Solution**: Check that the migration ran successfully and data exists in Firestore

## Adding New Data

To add new officials or SALN records:

### Option 1: Use Firebase Console
1. Go to Firestore Database
2. Navigate to `officials` collection
3. To add a new official:
   - Click "Add document"
   - Set document ID to the slug (e.g., `juan-dela-cruz` for "Juan Dela Cruz")
   - Add all official fields including `slug` field (same as document ID)
   - Add `saln_records` field as an array
4. To add a SALN to existing official:
   - Open the official's document (search by slug)
   - Click on `saln_records` array
   - Add a new array element with SALN data

### Option 2: Update Migration Script
1. Add new officials to the `officials` array in `migrate-to-firestore.js`
   - Include the old `id` field for SALN record grouping (it will be removed during migration)
   - The slug will be auto-generated from the name
2. Add new SALN records to `public/saln-records.json`
   - Use the old `official_id` format for grouping (it won't be stored in Firestore)
3. Re-run: `npm run migrate:firestore` (overwrites existing data)

### Option 3: Build an Admin Interface
Create a separate admin app with:
- Firebase Authentication for admin users
- Forms to add/edit officials and SALNs
- Uses Firebase Admin SDK or client SDK with write rules

## Performance Notes

- **Direct Lookups**: Slug-based document IDs enable O(1) lookups by slug
- **Single Read**: Getting an official + all SALNs = 1 document read
- **Firestore Native Caching**: 
  - **IndexedDB persistence**: Data cached in browser's IndexedDB (survives page reloads)
  - **Automatic cache management**: Firestore handles cache invalidation
  - **Offline support**: App works offline using cached data
  - **Cache-first strategy**: Reads from cache first, then network if needed
  - **Configurable sources**: Choose 'default', 'server', or 'cache' for each query
- **No Indexes Needed**: Simple queries, no composite indexes required
- **Document Size**: Current max ~8 SALNs per official, well under 1MB limit
- **URL Matching**: Document path matches URL structure (no additional queries)

### Caching Behavior

Firestore's built-in cache provides three data sources:

```typescript
// 1. Default (recommended): Cache-first, then server
const officials = await getOfficials();
const official = await findOfficialBySlug('ferdinand-marcos-jr');

// 2. Force fresh from server
const freshOfficials = await getOfficials(true);
const freshOfficial = await findOfficialBySlug('ferdinand-marcos-jr', 'server');

// 3. Cache-only (offline mode)
const official = await findOfficialBySlug('ferdinand-marcos-jr', 'cache');
```

**Cache Strategy:**
- ✅ **List views** (homepage): Default cache-first for fast loading
- ✅ **Detail views**: Default cache-first, Firestore ensures freshness
- ✅ **Offline mode**: Automatically serves from cache
- ✅ **IndexedDB persistence**: Cache survives browser restarts
- ✅ **No manual invalidation needed**: Firestore handles it automatically

**Firestore Cache Benefits:**
- Persists across page reloads (unlike in-memory cache)
- Automatic cache synchronization with server
- Built-in offline support
- Handles multi-tab scenarios
- More reliable than custom cache implementation
- Reduces Firestore read costs automatically

## Schema Changes

### Key Design Decisions

1. **Slug as Primary Identifier**: 
   - The `id` field (e.g., `pres-001`) has been **removed**
   - `slug` is now the primary and only identifier
   - Document ID = slug value for direct lookups

2. **Why remove `id`?**
   - Eliminates redundancy (id vs slug)
   - Slug is more meaningful and SEO-friendly
   - Direct document lookup using slug (URL path matches Firestore path)
   - Simpler data model

3. **Backward Compatibility**:
   - Migration script still uses old `id` field for grouping SALNs
   - `id` is stripped before writing to Firestore
   - All app functions now use slug instead of id

## Migration from Previous Structure

If you previously used separate `officials` and `saln_records` collections or had the `id` field:

1. **Delete old collections** (if they exist):
   - Old `saln_records` collection is no longer used
   - Old documents with `id` field will be replaced

2. **Update any custom queries** to use:
   - Slug instead of id
   - Nested structure instead of separate collections

3. **Re-deploy everything**:
   ```bash
   npm run migrate:firestore
   npm run deploy:firestore
   ```
