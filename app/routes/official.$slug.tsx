import { Link, redirect } from 'react-router';
import type { Route } from "./+types/official.$slug";
import type { Agency } from "../data/officials";
import { Header } from "../components/layout/Header";
import { Footer } from "../components/layout/Footer";
import { getAgencyDisplayName } from "../data/officials";
import { getArchive, readLegacyProfile } from "../archive/archive.server";
import { PersonProfile } from "../components/PersonProfile";
import { SALNRecordsView } from "../components/SALNRecordsView";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";

export function meta({ data, params }: Route.MetaArgs) {
  // Convert slug to readable name for meta tags
  const readableName = params.slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  
  const name = data?.person.person.canonicalName ?? readableName;
  return [
    { title: `${name} - SALN Archive | SALN Tracker PH` },
    { name: "description", content: `Inspect archived SALN Source Documents and public-office evidence for ${name}.` },
  ];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  if (process.env.ARCHIVE_ADAPTER && process.env.ARCHIVE_ADAPTER !== "firebase") {
    const person = await (await getArchive()).findPersonBySlug(params.slug);
    if (!person) throw new Response("Not Found", { status: 404 });
    if (params.slug !== person.person.slug) throw redirect(`/official/${encodeURIComponent(person.person.slug)}${new URL(request.url).search}`, 301);
    return { person, legacyPresentation: null };
  }
  const result = await readLegacyProfile(params.slug);
  if (!result) {
    throw new Response("Not Found", { status: 404 });
  }
  
  return result;
}

export default function OfficialSALN({ loaderData }: Route.ComponentProps) {
  const { person, legacyPresentation } = loaderData;
  if (!legacyPresentation) {
    return <>
      <Header />
      <main className="archive-container py-8 sm:py-12">
        <PersonProfile record={person} />
      </main>
      <Footer />
    </>;
  }
  const { official, officialWithSALN, salnRecords } = legacyPresentation;

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
                      {person.person.canonicalName}
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
