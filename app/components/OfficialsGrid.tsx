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
    <div className="space-y-6 sm:space-y-8">
      {Object.entries(groupedOfficials).map(([position, officialsList]) => (
        <div key={position}>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 sm:mb-6 tracking-tight px-1">
            {position}{officialsList.length > 1 ? 'S' : ''}
          </h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {officialsList.map((official, index) => {
              const officialWithSALN = getOfficialWithSALNData(official);
              return (
                <Card 
                  key={official.id} 
                  hoverable
                  className="h-full"
                >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base sm:text-lg leading-tight">
                        {official.name}
                      </CardTitle>
                    </div>
                    <Badge variant={getPositionColor(official.position)} className="text-xs flex-shrink-0">
                      {official.position}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  <div className="space-y-3 sm:space-y-4">

                    {/* SALN Info */}
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-gray-500 text-xs sm:text-sm">SALN Records</p>
                          <p className="font-semibold text-gray-900 text-sm sm:text-base">{officialWithSALN.saln_count}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs sm:text-sm">Latest Year</p>
                          <p className="font-semibold text-gray-900 text-sm sm:text-base">
                            {officialWithSALN.latest_saln_year || 'None'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <Link to={`/official/${generateSlug(official)}`} className="block">
                      <Button 
                        variant="primary" 
                        size="sm" 
                        className="w-full text-sm"
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
