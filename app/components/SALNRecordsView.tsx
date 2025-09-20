import type { Official, SALNRecord } from '../data/officials';
import { getSALNRecordsForOfficial } from '../data/officials';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Badge } from './ui/Badge';
import { Hashtags } from './ui/Hashtags';

interface SALNRecordsViewProps {
  official: Official;
}

export function SALNRecordsView({ official }: SALNRecordsViewProps) {
  // Get SALN records for this official from data
  const salnRecords = getSALNRecordsForOfficial(official.id);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusVariant = (status: SALNRecord['status']) => {
    switch (status) {
      case 'verified': return 'success';
      case 'submitted': return 'info';
      case 'under_review': return 'warning';
      case 'flagged': return 'danger';
      default: return 'default';
    }
  };

  const getStatusText = (status: SALNRecord['status']) => {
    switch (status) {
      case 'verified': return 'Verified';
      case 'submitted': return 'Submitted';
      case 'under_review': return 'Under Review';
      case 'flagged': return 'Flagged';
      default: return status;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
          SALN Records
        </h2>
        <p className="text-gray-600">
          {salnRecords.length} record{salnRecords.length !== 1 ? 's' : ''}
        </p>
      </div>

      {salnRecords.length > 0 ? (
        <div className="space-y-8">
          {salnRecords.map((record, index) => (
            <Card 
              key={record.id}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-2xl">
                      SALN {record.year}
                    </CardTitle>
                    <p className="text-sm text-gray-600 mt-1">
                      Filed: {new Date(record.date_filed).toLocaleDateString('en-PH', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                  <Badge variant={getStatusVariant(record.status)}>
                    {getStatusText(record.status)}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent>
                <div className="space-y-6">
                  {/* Financial Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-primary-50 p-4 rounded-lg border border-primary-100">
                      <p className="text-sm font-medium text-primary-600 mb-1">Net Worth</p>
                      <p className="text-xl font-bold text-primary-900">
                        {formatCurrency(record.net_worth)}
                      </p>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                      <p className="text-sm font-medium text-green-600 mb-1">Total Assets</p>
                      <p className="text-xl font-bold text-green-900">
                        {formatCurrency(record.total_assets)}
                      </p>
                    </div>
                    <div className="bg-red-50 p-4 rounded-lg border border-red-100">
                      <p className="text-sm font-medium text-red-600 mb-1">Total Liabilities</p>
                      <p className="text-xl font-bold text-red-900">
                        {formatCurrency(record.total_liabilities)}
                      </p>
                    </div>
                  </div>

                  {/* Assets and Liabilities Detail */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Assets */}
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 mb-3">
                        Assets ({record.assets.length})
                      </h4>
                      <div className="space-y-2">
                        {record.assets.map((asset, idx) => (
                          <div key={idx} className="bg-gray-50 p-3 rounded-lg">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <p className="font-medium text-gray-900 text-sm">
                                  {asset.description}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                  {asset.category}
                                </p>
                              </div>
                              <p className="font-bold text-gray-900 text-sm ml-2">
                                {formatCurrency(asset.value)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Liabilities */}
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 mb-3">
                        Liabilities ({record.liabilities.length})
                      </h4>
                      <div className="space-y-2">
                        {record.liabilities.map((liability, idx) => (
                          <div key={idx} className="bg-gray-50 p-3 rounded-lg">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <p className="font-medium text-gray-900 text-sm">
                                  {liability.nature}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                  {liability.creditor}
                                </p>
                              </div>
                              <p className="font-bold text-gray-900 text-sm ml-2">
                                {formatCurrency(liability.balance)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="text-center py-16">
          <CardContent>
            <div className="text-gray-300 text-8xl mb-6">📋</div>
            <h3 className="text-2xl font-semibold text-gray-900 mb-3">
              No SALN Data Yet
            </h3>
            <p className="text-gray-600 text-lg mb-4">
              SALN records for {official.name} have not been uploaded to this system yet.
            </p>
            <Hashtags size="lg" showSubtext={true} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
