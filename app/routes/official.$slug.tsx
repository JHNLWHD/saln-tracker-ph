import { Link } from 'react-router';
import type { Route } from "./+types/official.$slug";
import { Header } from "../components/layout/Header";
import { Footer } from "../components/layout/Footer";
import { findOfficialBySlug, getOfficialWithSALNData, getSALNRecordsForOfficial } from "../data/officials";
import { SALNRecordsView } from "../components/SALNRecordsView";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";

export function meta({ params }: Route.MetaArgs) {
  const official = findOfficialBySlug(params.slug);
  return [
    { title: `${official?.name} - SALN Records | SALN Tracker Philippines` },
    { name: "description", content: `View SALN records for ${official?.name}, ${official?.position}` },
  ];
}

export async function loader({ params }: Route.LoaderArgs) {
  const official = findOfficialBySlug(params.slug);
  if (!official) {
    throw new Response("Not Found", { status: 404 });
  }
  
  const [officialWithSALN, salnRecords] = await Promise.all([
    getOfficialWithSALNData(official),
    getSALNRecordsForOfficial(official.id)
  ]);
  
  salnRecords.sort((a, b) => {
    return b.year - a.year;
  });
  
  return { official, officialWithSALN, salnRecords };
}

export default function OfficialSALN({ loaderData }: Route.ComponentProps) {
  const { official, officialWithSALN, salnRecords } = loaderData;

  const getPositionColor = (position: string) => {
    switch (position) {
      case 'PRESIDENT': return 'ph-red';
      case 'VICE PRESIDENT': return 'ph-blue';
      case 'SENATOR': return 'ph-yellow';
      default: return 'default';
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
                <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-2">
                  <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 tracking-tight leading-tight">
                    {official.name}
                  </h1>
                  <Badge variant={getPositionColor(official.position)} size="lg" className="self-start">
                    {official.position}
                  </Badge>
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
