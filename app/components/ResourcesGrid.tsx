import { useState } from "react";
import type { Resource } from "~/data/resources";
import { Card, CardContent, CardHeader } from "./ui/Card";

interface ResourcesGridProps{
  resources: Resource[];  
}

type SortBy = 'id' | 'year' | 'type';

export function ResourcesGrid({ resources }: ResourcesGridProps) {
  const [sortBy, setSortBy] = useState<SortBy>('id');

  const handleSortBy = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortBy(e.target.value as SortBy);
  };

  const renderSortBy = () => {
    return (
      <div className="flex gap-3 items-center">
        <label htmlFor="sort-select" className="block text-sm font-bold text-gray-900">Sort by:
        </label>
        <select onChange={handleSortBy} value={sortBy} id="sort-select" className="shadow-md bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-max p-2.5 ">
          <option value="id" selected>--</option>
          <option value="year">Year</option>
          <option value="type">Type</option>
        </select>
      </div>
    );
  };

  const sortResources = (data: Resource[], sortCondition: SortBy) => {
    const sortedResources = [...resources];

    switch (sortCondition) {
      case 'id':
        sortedResources.sort((a, b) => a.id - b.id);
        break;
      case 'year':
        sortedResources.sort((a, b) => (a?.year || 0) - (b?.year || 0));
        break;
      case 'type':
        sortedResources.sort((a, b) => {
          const typeA = a.type.toUpperCase();
          const typeB = b.type.toUpperCase();
          if (typeA < typeB) return -1;

          if (typeA > typeB) return 1;

          return 0;
        });
        break;
      default:
        sortedResources.sort((a, b) => a.id - b.id);
        break;
    }

    return sortedResources;
  }

  const resourcesList =(() => {
    const rawResources = [...resources];
    return sortResources(rawResources, sortBy);
  })();

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="text-sm text-gray-500 mb-4 sm:mb-6 tracking-tight px-1">{renderSortBy()}</div>
      {resourcesList.map((data, index) => {
        return (
          <Card>
            {/* Will find cards with web previews */}
          </Card>
        )
      })}
    </div>
  );
}