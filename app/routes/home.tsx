import type { Route } from "./+types/home";
import { Header } from "../components/layout/Header";
import { Footer } from "../components/layout/Footer";
import { OfficialsGrid } from "../components/OfficialsGrid";
import { Hashtags } from "../components/ui/Hashtags";
import { CallToActionBanner } from "../components/CallToActionBanner";
import { getOfficialsWithSALNData } from "../data/officials";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "SALN Tracker Philippines - Public Officials Transparency" },
    { name: "description", content: "Track and monitor Statement of Assets, Liabilities, and Net Worth (SALN) of Philippine public officials. Promoting transparency and accountability in government." },
  ];
}

export async function loader({}: Route.LoaderArgs) {
  const officials = await getOfficialsWithSALNData();
  return { officials };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="container mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-8">
        <div className="space-y-6 sm:space-y-8">
          {/* Hero Section */}
          <div className="text-center py-8 sm:py-12 px-4 sm:px-6 bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl text-white">
            <h1 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3 sm:mb-4 leading-tight">
              SALN Tracker Philippines
            </h1>
            <p className="text-base sm:text-xl text-primary-100 mb-2 px-2">
              Statement of Assets, Liabilities, and Net Worth
            </p>
            <p className="text-sm sm:text-base text-primary-200 mb-4 sm:mb-6 px-2 leading-relaxed">
              Promoting Transparency and Accountability in Government
            </p>
            <Hashtags variant="glass" size="md" className="sm:hidden" />
            <Hashtags variant="glass" size="lg" className="hidden sm:inline-block" />
          </div>
          
          {/* Call for Help Banner */}
          <CallToActionBanner />
          
          {/* Officials Grid */}
          <OfficialsGrid officials={loaderData.officials} />
        </div>
      </main>

      <Footer />
    </div>
  );
}
