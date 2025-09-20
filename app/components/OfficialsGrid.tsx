import { Link } from 'react-router';
import type { Official } from '../data/officials';
import { generateSlug, getOfficialWithSALNData } from '../data/officials';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

interface OfficialsGridProps {
  officials: Official[];
}

export function OfficialsGrid({ officials }: OfficialsGridProps) {
  const getPositionColor = (position: Official['position']) => {
    switch (position) {
      case 'PRESIDENT':
        return 'ph-red';
      case 'VICE PRESIDENT':
        return 'ph-blue';
      case 'SENATOR':
        return 'ph-yellow';
      default:
        return 'default';
    }
  };

  const groupedOfficials = {
    PRESIDENT: officials.filter(o => o.position === 'PRESIDENT'),
    'VICE PRESIDENT': officials.filter(o => o.position === 'VICE PRESIDENT'),
    SENATOR: officials.filter(o => o.position === 'SENATOR')
  };

  return (
    <div className="space-y-8">
      {Object.entries(groupedOfficials).map(([position, officialsList]) => (
        <div key={position}>
          <h2 className="text-2xl font-bold text-gray-900 mb-6 tracking-tight">
            {position}{officialsList.length > 1 ? 'S' : ''}
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {officialsList.map((official, index) => {
              const officialWithSALN = getOfficialWithSALNData(official);
              return (
                <Card 
                  key={official.id} 
                  hoverable
                >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        {official.name}
                      </CardTitle>
                    </div>
                    <Badge variant={getPositionColor(official.position)}>
                      {official.position}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="space-y-4">

                    {/* SALN Info */}
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-gray-500">SALN Records</p>
                          <p className="font-semibold text-gray-900">{officialWithSALN.saln_count}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Latest Year</p>
                          <p className="font-semibold text-gray-900">
                            {officialWithSALN.latest_saln_year || 'None'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <Link to={`/official/${generateSlug(official)}`}>
                      <Button 
                        variant="primary" 
                        size="sm" 
                        className="w-full"
                      >
                        View SALN Records
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
