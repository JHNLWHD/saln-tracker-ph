// Resource Records
export interface Resource {
  id: string;
  description: string;
  source_url: string;
  year?: number;
  type: string;
}

// Resource Data interface for JSON structure
interface ResourceDataFile {
  metadata: {
    version: string;
    last_updated: string;
    total_records: number;
    source: string;
    description: string;
  };
  data: Resource[];
}

// Cache for Resources data to avoid repeated fetches
let resourceDataCache: Resource[] | null = null;

// Function to load Resources from json file
async function loadResources(): Promise<Resource[]> {
  if (resourceDataCache) {
    return resourceDataCache;
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

    const response = await fetch(`${baseUrl}/resources.json`);
    if (!response.ok) {
      throw new Error(`Failed to load resources: ${response.status}`);
    }

    const resourcesData: ResourceDataFile = await response.json();
    resourceDataCache = resourcesData.data;
    return resourceDataCache;
  } catch (error) {
    console.error('Error loading Resources:', error);
    // Return empty array as fallback
    return [];
  } 
}

// Export a function that returns a promise for Resource records
export async function getResourceRecords() {
  const allResources = await loadResources();
  return allResources;
}
