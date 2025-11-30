import { Link } from 'react-router';
import type { Route } from "./+types/official.$slug";
import type { Agency } from "../data/officials";
import { Header } from "../components/layout/Header";
import { Footer } from "../components/layout/Footer";
import { findOfficialBySlug, getOfficialWithSALNData, getAgencyDisplayName } from "../data/officials";
import { SALNRecordsView } from "../components/SALNRecordsView";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";

export function meta({ params }: Route.MetaArgs) {
  // Convert slug to readable name for meta tags
  const readableName = params.slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  
  return [
    { title: `${readableName} - SALN Records | SALN Tracker Philippines` },
    { name: "description", content: `View SALN records for ${readableName}` },
  ];
}

export async function loader({ params }: Route.LoaderArgs) {
  // Direct Firestore lookup using slug as document ID (most efficient)
  const official = await findOfficialBySlug(params.slug);
  if (!official) {
    throw new Response("Not Found", { status: 404 });
  }
  
  // Get computed SALN data
  const officialWithSALN = await getOfficialWithSALNData(official);
  
  // Get SALN records and sort by year DESC (most recent first)
  // Note: Firestore preserves insertion order for arrays, doesn't auto-sort
  // This ensures correct display order even if data is added/modified manually
  const salnRecords = (official.saln_records || []).slice().sort((a, b) => b.year - a.year);
  
  return { official, officialWithSALN, salnRecords };
}

export default function OfficialSALN({ loaderData }: Route.ComponentProps) {
  const { official, officialWithSALN, salnRecords } = loaderData;

  const getAgencyBadgeVariant = (agency: Agency): 'executive' | 'legislative' | 'constitutional' | 'judiciary' => {
    switch (agency) {
      case 'EXECUTIVE':
        return 'executive';
      case 'LEGISLATIVE':
        return 'legislative';
      case 'CONSTITUTIONAL_COMMISSION':
        return 'constitutional';
      case 'JUDICIARY':
        return 'judiciary';
      default:
        return 'executive';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="container mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-8">
        <div className="space-y-6 sm:space-y-8">
          {/* Back Button */}
          <div>
            <Link to="/">
              <Button 
                variant="ghost" 
                className="mb-2 sm:mb-4 text-sm"
              >
                ← Back to Home
              </Button>
            </Link>
          </div>

          {/* Official Header */}
          <div className="bg-white rounded-xl p-4 sm:p-6 lg:p-8 shadow-md">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 sm:gap-6">
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-3 mb-2">
                  <div className="flex flex-wrap items-start gap-3">
                    <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 tracking-tight leading-tight">
                      {official.name}
                    </h1>
                    <Badge variant={getAgencyBadgeVariant(official.agency)} size="lg" className="self-start">
                      {getAgencyDisplayName(official.agency)}
                    </Badge>
                  </div>
                  <p className="text-sm sm:text-base text-gray-600">
                    {official.position}
                  </p>
                  {official.status === 'inactive' && (
                    <Badge variant="default" size="sm" className="self-start">
                      Former Official
                    </Badge>
                  )}
                </div>
              </div>
              
              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg flex-shrink-0">
                <div className="grid grid-cols-2 gap-3 sm:gap-4 text-center">
                  <div>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900">{officialWithSALN?.saln_count || 0}</p>
                    <p className="text-xs sm:text-sm text-gray-600">SALN Records</p>
                  </div>
                  <div>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900">{officialWithSALN?.latest_saln_year || 'None'}</p>
                    <p className="text-xs sm:text-sm text-gray-600">Latest Year</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SALN Records */}
          <SALNRecordsView official={official} salnRecords={salnRecords} />
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
