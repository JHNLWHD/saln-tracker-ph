export interface Resource {
  id: number;
  description: string;
  source_url: string;
  year: number;
  type: string;
  source: string;
  summary?: string;
}

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

let resourceDataCache: Resource[] | null = null;

async function loadResources(): Promise<Resource[]> {
  if (resourceDataCache) {
    return resourceDataCache;
  }

  try {
    let baseUrl: string;
    
    if (typeof window !== 'undefined') {
      baseUrl = window.location.origin;
    } else {
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
    return [];
  } 
}

export async function getResourceRecords() {
  const allResources = await loadResources();
  return allResources;
}
