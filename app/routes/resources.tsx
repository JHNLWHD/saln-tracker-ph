import { Header } from "~/components/layout/Header";
import type { Route } from "./+types/resources";
import { Footer } from "~/components/layout/Footer";
import { Hashtags } from "~/components/ui/Hashtags";
import { ResourcesGrid } from "~/components/ResourcesGrid";
import { getResourceRecords } from "~/data/resources";


export function meta({}: Route.MetaArgs) {
  return [
    { title: "Resources - SALN Tracker Philippines"},
    { name: "description", content: "Resources realted to SALN"},
  ];
}

export async function loader({}: Route.LoaderArgs) {
  const resources = await getResourceRecords();
  return { resources };
}

export default function Resources({ loaderData }: Route.ComponentProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="container mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-8">
        <div className="space-y-6 sm:space-y-8">
          {/* Hero Section */}
          <div className="text-center py-8 sm:py-12 px-4 sm:px-6 bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl text-white">
            <h1 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3 sm:mb-4 leading-tight">
              SALN Resources
            </h1>
            <p className="text-base sm:text-xl text-primary-100 mb-2 px-2">
              Content and Links Related to SALN
            </p>
            <p className="text-sm sm:text-base text-primary-200 mb-4 sm:mb-6 px-2 leading-relaxed">
              Promoting Transparency Through Accesible Resources
            </p>
            <Hashtags variant="glass" size="md" className="sm:hidden" />
            <Hashtags variant="glass" size="lg" className="hidden sm:inline-block" />
          </div>

          {/* Info Cards */}
          <ResourcesGrid resources={ loaderData.resources }/>

        </div>
      </main>

      <Footer />
    </div>
  );
}