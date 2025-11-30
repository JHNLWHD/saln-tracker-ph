import { Link } from 'react-router';
import type { Official, SALNRecord, Agency } from '../data/officials';
import { generateSlug, formatCurrency, getAgencyDisplayName, groupOfficialsByStatusAndAgency } from '../data/officials';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Hashtags } from './ui/Hashtags';
import { CollapsibleSection } from './ui/CollapsibleSection';
import { useState } from 'react';

interface OfficialWithSALN extends Official {
  saln_count: number;
  latest_saln_year?: number;
  latest_saln_record?: SALNRecord;
}

interface OfficialsGridProps {
  officials: OfficialWithSALN[];
}

type SortBy = 'net_worth' | 'assets' | 'liabilities' | 'last_name' | 'first_name' | 'default';

export function OfficialsGrid({ officials }: OfficialsGridProps) {
  const [sortBy, setSortBy] = useState<SortBy>('default');

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

  const handleSortBy = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortBy(e.target.value as SortBy);
  };

  const renderSortBy = () => {
    return (
      <div className="flex gap-3 items-center">
        <label htmlFor="sort-select" className="block text-sm font-bold text-gray-900">Sort by:
        </label>
        <select onChange={handleSortBy} value={sortBy} id="sort-select" className="shadow-md bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-max p-2.5 ">
          <option value="default">--</option>
          <option value="net_worth">Net Worth</option>
          <option value="assets">Assets</option>
          <option value="liabilities">Liabilities</option>
          <option value="first_name">First Name</option>
          <option value="last_name">Last Name</option>
        </select>
      </div>
    );
  };

  const sortOfficials = (officialsList: OfficialWithSALN[], sortCondition: SortBy) => {
    const getLastName = (name: string) => {
      return name.split(' ')[name.split(' ').length - 1];
    };
    const sorted = [...officialsList];

    switch (sortCondition) {
      case 'net_worth':
        sorted.sort((a, b) => (b?.latest_saln_record?.net_worth || 0) - (a?.latest_saln_record?.net_worth || 0))
        break;
      case 'assets':
        sorted.sort((a, b) => (b.latest_saln_record?.total_assets || 0) - (a.latest_saln_record?.total_assets || 0));
        break;
      case 'liabilities':
        sorted.sort((a, b) => (b.latest_saln_record?.total_liabilities || 0) - (a.latest_saln_record?.total_liabilities || 0));
        break;
      case 'last_name':
        sorted.sort((a, b) => getLastName(a.name).localeCompare(getLastName(b.name)));
        break;
      case 'first_name':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default:
        break;
    }

    return sorted;
  };

  const grouped = groupOfficialsByStatusAndAgency(officials);

  const renderOfficialCard = (official: OfficialWithSALN) => {
    return (
      <Card
        key={official.id}
        hoverable
        className="h-full flex flex-col"
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base sm:text-lg leading-tight">
                {official.name}
              </CardTitle>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                {official.position}
              </p>
            </div>
            <Badge variant={getAgencyBadgeVariant(official.agency)} className="text-xs flex-shrink-0">
              {getAgencyDisplayName(official.agency)}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="pt-0 flex-1">
          <div className="space-y-3 sm:space-y-4">
            {official.latest_saln_record ? (
              <div className="space-y-3">
                <p className="text-gray-600 text-xs sm:text-sm font-medium text-center">
                  Latest SALN ({official.latest_saln_year})
                </p>

                <div className="bg-primary-50 p-3 sm:p-4 rounded-lg border border-primary-100">
                  <p className="text-xs sm:text-sm font-medium text-primary-600 mb-1 text-center">Net Worth</p>
                  <p className="text-base sm:text-xl font-bold text-primary-900 leading-tight text-center">
                    {formatCurrency({ amount: official.latest_saln_record.net_worth, shorten: true })}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
                  <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                    <p className="text-green-600 font-medium mb-1">Assets</p>
                    <p className="font-bold text-green-900">
                      {formatCurrency({ amount: official.latest_saln_record.total_assets, shorten: true })}
                    </p>
                  </div>
                  <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                    <p className="text-red-600 font-medium mb-1">Liabilities</p>
                    <p className="font-bold text-red-900">
                      {formatCurrency({ amount: official.latest_saln_record.total_liabilities, shorten: true })}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-gray-50 border-2 border-dashed border-gray-300 p-4 rounded-lg text-center">
                  <p className="text-gray-500 text-sm font-medium mb-1">No SALN Data Yet</p>
                  <p className="text-xs text-gray-400">
                    SALN records for {official.name.split(' ')[0]} have not been uploaded to this system yet.
                  </p>
                </div>
                <div className="text-center space-y-2">
                  <Hashtags size="sm" showSubtext={true} />
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Please help us by asking for <strong>{official.name}'s</strong> SALN here{' '}
                    <Link
                      to="https://www.ombudsman.gov.ph/request-for-copy-of-salns/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-primary-600"
                    >
                      https://www.ombudsman.gov.ph/request-for-copy-of-salns/
                    </Link>
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>

        <div className="mt-auto">
          <div className="pb-3 border-t border-gray-100">
            <div className="flex items-center justify-between text-sm pt-3">
              <span className="text-gray-500">Available Records</span>
              <span className="font-semibold text-gray-900">{official.saln_count}</span>
            </div>
          </div>

          <div className="pt-0">
            <Link to={`/official/${generateSlug(official)}`} className="block">
              <Button
                variant="primary"
                size="sm"
                className="w-full text-sm"
              >
                {official.latest_saln_record ? 'View Full SALN Data' : 'View Profile'}
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    );
  };

  const renderAgencySection = (agency: Agency, officialsList: OfficialWithSALN[]) => {
    if (officialsList.length === 0) return null;

    const sortedOfficials = sortOfficials(officialsList, sortBy);

    return (
      <CollapsibleSection
        key={agency}
        title={getAgencyDisplayName(agency)}
        count={sortedOfficials.length}
        defaultExpanded={agency === 'EXECUTIVE' || agency === 'LEGISLATIVE'}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {sortedOfficials.map((official) => (
            <div key={official.id}>
              {renderOfficialCard(official)}
            </div>
          ))}
        </div>
      </CollapsibleSection>
    );
  };

  const activeCount = officials.filter(o => o.status === 'active').length;
  const inactiveCount = officials.filter(o => o.status === 'inactive').length;

  const agencies: Agency[] = ['EXECUTIVE', 'LEGISLATIVE', 'CONSTITUTIONAL_COMMISSION', 'JUDICIARY'];

  return (
    <div className="space-y-8 sm:space-y-10">
      {activeCount > 0 && (
        <div className="space-y-4 sm:space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
              Current Officials
            </h2>
            <div className="text-sm text-gray-500">
              {renderSortBy()}
            </div>
          </div>

          <div className="space-y-4">
            {agencies.map(agency => renderAgencySection(agency, grouped.active[agency]))}
          </div>
        </div>
      )}

      {inactiveCount > 0 && (
        <div className="space-y-4 sm:space-y-6">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
            Former Officials
          </h2>

          <div className="space-y-4">
            {agencies.map(agency => renderAgencySection(agency, grouped.inactive[agency]))}
          </div>
        </div>
      )}
    </div>
  );
}
