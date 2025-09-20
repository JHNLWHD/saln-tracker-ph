import type { Route } from "./+types/about";
import { Header } from "../components/layout/Header";
import { Footer } from "../components/layout/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Hashtags } from "../components/ui/Hashtags";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "About - SALN Tracker Philippines" },
    { name: "description", content: "Learn about SALN Tracker Philippines - a platform for monitoring public officials' financial transparency through SALN records." },
  ];
}

export default function About() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="container mx-auto px-4 lg:px-8 py-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Hero Section */}
          <div className="text-center py-8">
            <h1 className="text-4xl font-bold text-gray-900 tracking-tight mb-4">
              About SALN Tracker Philippines
            </h1>
            <p className="text-xl text-gray-600 mb-6">
              Promoting Government Transparency Through Public Access to SALN Records
            </p>
            <Hashtags size="lg" />
          </div>

          {/* What is SALN */}
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">What is a SALN?</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700 leading-relaxed mb-4">
                A <strong>Statement of Assets, Liabilities, and Net Worth (SALN)</strong> is a document that all 
                public officials in the Philippines are required to file annually. It provides a comprehensive 
                overview of their financial status, including:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 mb-4">
                <li>Real and personal properties owned</li>
                <li>Business interests and financial connections</li>
                <li>Outstanding liabilities and debts</li>
                <li>Net worth calculation</li>
              </ul>
              <p className="text-gray-700 leading-relaxed">
                SALN filing is mandated by the Constitution and various laws to ensure transparency 
                and prevent corruption in government service.
              </p>
            </CardContent>
          </Card>

          {/* Our Mission */}
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Our Mission</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700 leading-relaxed mb-4">
                SALN Tracker Philippines is dedicated to promoting government transparency by providing 
                easy public access to SALN records of Philippine public officials. We believe that 
                transparency is fundamental to good governance and democratic accountability.
              </p>
              <div className="bg-accent-50 border border-accent-200 rounded-lg p-4">
                <p className="text-accent-800 font-medium mb-2">Our Goals:</p>
                <ul className="list-disc list-inside space-y-1 text-accent-700 text-sm">
                  <li>Make SALN records easily accessible to the public</li>
                  <li>Promote transparency and accountability in government</li>
                  <li>Support informed civic participation</li>
                  <li>Encourage compliance with SALN filing requirements</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Important Disclaimer */}
          <Card className="border-2 border-primary-200 bg-primary-50">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Badge variant="ph-blue" size="lg">Important</Badge>
                <CardTitle className="text-2xl text-primary-900">Data Source Disclaimer</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-primary-800">
                <p className="font-medium text-lg">
                  We are a data aggregator, not the original source of SALN information.
                </p>
                <div className="space-y-3">
                  <p className="leading-relaxed">
                    <strong>Official Data Sources Only:</strong> All SALN data displayed on this platform 
                    is sourced exclusively from official government channels, including:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Office of the Ombudsman</li>
                    <li>Civil Service Commission</li>
                    <li>Senate and House of Representatives</li>
                    <li>Other authorized government agencies</li>
                  </ul>
                  <p className="leading-relaxed">
                    <strong>Our Role:</strong> We serve as an independent aggregator that compiles, 
                    organizes, and presents publicly available SALN information in an accessible format. 
                    We do not create, modify, or verify the accuracy of the underlying data.
                  </p>
                  <p className="leading-relaxed">
                    <strong>Verification:</strong> For official verification or the most current information, 
                    please refer directly to the appropriate government agencies that maintain the original records.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Legal Framework */}
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Legal Framework</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700 leading-relaxed mb-4">
                SALN filing and public disclosure is governed by several Philippine laws:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-2">1987 Constitution</h4>
                  <p className="text-sm text-gray-700">Article XI, Section 17 - Public accountability of public officers</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-2">Republic Act 6713</h4>
                  <p className="text-sm text-gray-700">Code of Conduct and Ethical Standards for Public Officials</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-2">Republic Act 3019</h4>
                  <p className="text-sm text-gray-700">Anti-Graft and Corrupt Practices Act</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-2">FOI Executive Order</h4>
                  <p className="text-sm text-gray-700">Freedom of Information in the Executive Branch</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Contact */}
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Support Transparency</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700 leading-relaxed mb-4">
                Help us promote government transparency by sharing this platform and using our hashtags 
                to spread awareness about the importance of SALN disclosure.
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="ph-blue" size="lg">#OpenSALN</Badge>
                <Badge variant="ph-red" size="lg">#PublicSALNNow</Badge>
                <Badge variant="ph-yellow" size="lg">#TransparencyPH</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
