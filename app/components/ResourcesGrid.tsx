import { useState } from "react";
import type { Resource } from "~/data/resources";
import { Badge } from "./ui/Badge";
import { LinkImage, LinkPreviewCard, LinkPreviewContent, LinkPreviewHeadline, LinkPreviewTags } from "./ui/LinkPreviewCards";

interface ResourcesGridProps{
  resources: Resource[];  
}

type SortBy = 'year' | 'type' | 'source';

export function ResourcesGrid({ resources }: ResourcesGridProps) {
  const [sortBy, setSortBy] = useState<SortBy>('year');

  const handleSortBy = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortBy(e.target.value as SortBy);
  };

  const renderSortBy = () => {
    return (
      <div className="flex gap-3 items-center">
        <label htmlFor="sort-select" className="block text-sm font-bold text-gray-900">Sort by:
        </label>
        <select onChange={handleSortBy} value={sortBy} id="sort-select" className="shadow-md bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-max p-2.5 ">
          <option value="year">Year</option>
          <option value="type">Type</option>
          <option value="source">Source</option>
        </select>
      </div>
    );
  };

  const sortResources = (data: Resource[], sortCondition: SortBy) => {
    const sortedResources = [...resources];

    switch (sortCondition) {
      case 'year':
        // Descending Order
        sortedResources.sort((a, b) => (b?.year || 0) - (a?.year || 0));
        break;
      case 'type':
      case 'source':
        // Ascending Order
        sortedResources.sort((a, b) => {
          const typeA = sortCondition == 'type' ? a.type.toUpperCase() : a.source.toUpperCase();
          const typeB = sortCondition == 'type' ? b.type.toUpperCase() : b.source.toUpperCase();
          if (typeA < typeB) return -1;

          if (typeA > typeB) return 1;

          return 0;
        });
        break;
      default:
        // Default is Descending Year
        sortedResources.sort((a, b) => (b?.year || 0) - (a?.year || 0));
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {resourcesList.map((data, index) => {
          return (
            <LinkPreviewCard
            link={data.source_url}
            hoverable
            className="h-full flex flex-col"
            >
              <LinkImage
                recordId={data.id}
                type={data.type}
                alt="A preview of the link"
              />
              
              <LinkPreviewContent>
                <LinkPreviewHeadline className="h-16 line-clamp-2">
                  {data.description}
                </LinkPreviewHeadline>

                <p className="h-38 text-sm text-gray-700 mt-2">
                  {data.summary}
                </p>
              </LinkPreviewContent>
              
              <LinkPreviewTags>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <Badge variant="ph-red" className="text-xs flex-shrink-0">
                      {data.source} | {data.year}
                    </Badge>
                  </div>
                  <Badge variant="ph-yellow" className="text-xs flex-shrink-0">
                    {data.type}
                  </Badge>
                </div>
              </LinkPreviewTags>
            </LinkPreviewCard>
          )
        })}
      </div>
    </div>
  );
}