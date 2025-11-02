import type { Official, SALNRecord } from '../data/officials';
import { formatCurrency } from '../data/officials';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Badge } from './ui/Badge';
import { Hashtags } from './ui/Hashtags';
import { NetWorthChart } from './NetWorthChart';

interface SALNRecordsViewProps {
  official: Official;
  salnRecords?: SALNRecord[];
}

export function SALNRecordsView({ official, salnRecords = [] }: SALNRecordsViewProps) {


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
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
          SALN Records
        </h2>
        <p className="text-sm sm:text-base text-gray-600">
          {salnRecords.length} record{salnRecords.length !== 1 ? 's' : ''}
        </p>
      </div>

      {salnRecords.length > 0 ? (
        <div className="space-y-6 sm:space-y-8">
          {salnRecords.length >= 2 && (
            <Card>
              <CardContent className="pt-6">
                <NetWorthChart salnRecords={salnRecords} />
              </CardContent>
            </Card>
          )}

          {/* SALN Records */}
          {salnRecords.map((record, index) => (
            <Card 
              key={record.id}
            >
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-lg sm:text-2xl">
                      SALN {record.year}
                    </CardTitle>
                    <p className="text-xs sm:text-sm text-gray-600 mt-1">
                      Filed: {new Date(record.date_filed).toLocaleDateString('en-PH', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                  <Badge variant={getStatusVariant(record.status)} className="text-xs flex-shrink-0">
                    {getStatusText(record.status)}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent>
                <div className="space-y-4 sm:space-y-6">
                  {/* Financial Summary */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                    <div className="bg-green-50 p-3 sm:p-4 rounded-lg border border-green-100">
                      <p className="text-xs sm:text-sm font-medium text-green-600 mb-1">Total Assets</p>
                      <p className="text-base sm:text-xl font-bold text-green-900 leading-tight">
                        {formatCurrency({ amount: record.total_assets, shorten: false })}
                      </p>
                    </div>
                    <div className="bg-red-50 p-3 sm:p-4 rounded-lg border border-red-100">
                      <p className="text-xs sm:text-sm font-medium text-red-600 mb-1">Total Liabilities</p>
                      <p className="text-base sm:text-xl font-bold text-red-900 leading-tight">
                        {formatCurrency({ amount: record.total_liabilities, shorten: false })}
                      </p>
                    </div>
                    <div className="bg-primary-50 p-3 sm:p-4 rounded-lg border border-primary-100">
                      <p className="text-xs sm:text-sm font-medium text-primary-600 mb-1">Net Worth</p>
                      <p className="text-base sm:text-xl font-bold text-primary-900 leading-tight">
                        {formatCurrency({ amount: record.net_worth, shorten: false })}
                      </p>
                    </div>
                  </div>

                  {/* Assets and Liabilities Detail */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                    {/* Assets */}
                    <div>
                      <h4 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">
                        Assets ({record.assets.length})
                      </h4>
                      <div className="space-y-2 max-h-64 sm:max-h-80 overflow-y-auto">
                        {record.assets.map((asset, idx) => (
                          <div key={idx} className="bg-gray-50 p-3 rounded-lg">
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 text-xs sm:text-sm leading-tight">
                                  {asset.description}
                                </p>
                                {asset.source && (
                                  <p className="text-xs text-gray-500 mt-1 truncate">
                                    {asset.source}
                                  </p>
                                )}
                              </div>
                              <p className="font-bold text-gray-900 text-xs sm:text-sm flex-shrink-0">
                                {formatCurrency({ amount: asset.value, shorten: false })}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Liabilities */}
                    <div>
                      <h4 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">
                        Liabilities ({record.liabilities.length})
                      </h4>
                      <div className="space-y-2 max-h-64 sm:max-h-80 overflow-y-auto">
                        {record.liabilities.map((liability, idx) => (
                          <div key={idx} className="bg-gray-50 p-3 rounded-lg">
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 text-xs sm:text-sm leading-tight">
                                  {liability.nature}
                                </p>
                                <p className="text-xs text-gray-500 mt-1 truncate">
                                  {liability.creditor}
                                </p>
                              </div>
                              <p className="font-bold text-gray-900 text-xs sm:text-sm flex-shrink-0">
                                {formatCurrency({ amount: liability.balance, shorten: false })}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Source Link */}
                  {record.source_url && (
                    <div className="pt-4 sm:pt-6 border-t border-gray-100">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1">
                            Data Source
                          </p>
                          <p className="text-xs sm:text-sm text-gray-500">
                            {record.source_description || 'Official Government Source'}
                          </p>
                        </div>
                        <a
                          href={record.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-2 text-xs sm:text-sm font-medium text-primary-600 hover:text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors duration-200 flex-shrink-0"
                        >
                          <span>View Source</span>
                          <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      </div>
                    </div>
                  )}

                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="text-center py-12 sm:py-16">
          <CardContent>
            <div className="text-gray-300 text-6xl sm:text-8xl mb-4 sm:mb-6">📋</div>
            <h3 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-3 px-4">
              No SALN Data Yet
            </h3>
            <p className="text-gray-600 text-sm sm:text-lg mb-4 sm:mb-6 px-4 leading-relaxed">
              SALN records for {official.name} have not been uploaded to this system yet.
            </p>
            <div className="px-4">
              <Hashtags size="md" showSubtext={true} className="sm:hidden" />
              <Hashtags size="lg" showSubtext={true} className="hidden sm:inline-block" />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
