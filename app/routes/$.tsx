import { Link } from 'react-router';
import type { Route } from "./+types/$";
import { Header } from "../components/layout/Header";
import { Footer } from "../components/layout/Footer";
import { Card, CardContent } from "../components/ui/Card";
import { Hashtags } from "../components/ui/Hashtags";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Page Not Found - SALN Tracker Philippines" },
    { name: "description", content: "The page you're looking for doesn't exist. Return to SALN Tracker Philippines homepage." },
  ];
}

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="container mx-auto px-3 sm:px-4 lg:px-8 py-8 sm:py-16">
        <div className="max-w-2xl mx-auto text-center">
          <Card>
            <CardContent className="py-12 sm:py-16 px-4 sm:px-6">
              {/* 404 Icon */}
              <div className="text-primary-500 text-6xl sm:text-8xl mb-4 sm:mb-6">
                🔍
              </div>
              
              {/* Error Message */}
              <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 tracking-tight mb-3 sm:mb-4 leading-tight">
                Page Not Found
              </h1>
              <p className="text-base sm:text-xl text-gray-600 mb-2 px-2">
                The page you're looking for doesn't exist.
              </p>
              <p className="text-sm sm:text-base text-gray-500 mb-6 sm:mb-8 px-2 leading-relaxed">
                It may have been moved, deleted, or you entered the wrong URL.
              </p>

              {/* Hashtags */}
              <div className="mb-6 sm:mb-8 px-2">
                <Hashtags size="md" showSubtext={true} className="sm:hidden" />
                <Hashtags size="lg" showSubtext={true} className="hidden sm:inline-block" />
              </div>

              {/* Helpful Links */}
              <div className="mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-gray-100">
                <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4">
                  Looking for something specific?
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  <Link 
                    to="/" 
                    className="text-sm text-primary-600 hover:text-primary-700 underline"
                  >
                    View All Officials
                  </Link>
                  <span className="text-gray-400">•</span>
                  <Link 
                    to="/about" 
                    className="text-sm text-primary-600 hover:text-primary-700 underline"
                  >
                    About SALN
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
