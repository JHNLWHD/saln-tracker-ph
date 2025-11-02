import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Bar, BarChart, Legend, LabelList } from 'recharts';
import type { TooltipProps } from 'recharts';
import type { SALNRecord } from '../data/officials';
import { formatCurrency } from '../data/officials';

const NETWORTH_BLUE = '#002d8a';
const ASSETS_GREEN = '#16a34a';
const LIABILITIES_RED = '#dc2626';

interface NetWorthChartProps {
  salnRecords: SALNRecord[];
}

interface ChartDataPoint {
  year: string;
  netWorth: number;
  assets: number;
  liabilities: number;
}

interface CustomTooltipProps extends TooltipProps<number, string> {
  active?: boolean;
  payload?: Array<{
    payload: ChartDataPoint;
  }>;
}

interface CustomLabelProps {
  x?: number;
  y?: number;
  value?: number;
  index?: number;
}

export function NetWorthChart({ salnRecords }: NetWorthChartProps) {
  const chartData: ChartDataPoint[] = salnRecords
    .slice()
    .sort((a, b) => a.year - b.year)
    .map(record => ({
      year: record.year.toString(),
      netWorth: record.net_worth,
      assets: record.total_assets,
      liabilities: record.total_liabilities,
    }));

  const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
    if (active && payload && payload.length && payload[0].payload) {
      const data = payload[0].payload;
      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 sm:p-4">
          <p className="text-xs sm:text-sm font-semibold text-gray-900 mb-2">
            Year {data.year}
          </p>
          <div className="space-y-1 text-xs sm:text-sm">
            <div className="flex justify-between items-center gap-4">
              <span className="text-gray-600">Assets:</span>
              <span className="font-semibold text-green-700">
                {formatCurrency({ amount: data.assets, shorten: false })}
              </span>
            </div>
            <div className="flex justify-between items-center gap-4">
              <span className="text-gray-600">Liabilities:</span>
              <span className="font-semibold text-red-700">
                {formatCurrency({ amount: data.liabilities, shorten: false })}
              </span>
            </div>
            <div className="pt-1 mt-1 border-t border-gray-200">
              <div className="flex justify-between items-center gap-4">
                <span className="text-gray-600">Net Worth:</span>
                <span className="font-bold text-primary-900">
                  {formatCurrency({ amount: data.netWorth, shorten: false })}
                </span>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const formatYAxisLabel = (value: number) => {
    return formatCurrency({ amount: value, shorten: true });
  };

  const formatDataPointLabel = (value: number) => {
    return formatCurrency({ amount: value, shorten: true });
  };

  const BarLabel = (props: { x?: number; y?: number; width?: number; value?: number }) => {
    const { x, y, width, value } = props;
    if (x === undefined || y === undefined || width === undefined || value === undefined) {
      return null;
    }
    
    // Hide labels if bar is too narrow (mobile)
    if (width < 20) {
      return null;
    }
    
    const centerX = x + width / 2;
    
    // Adjust font size based on bar width
    const fontSize = width < 30 ? 8 : width < 40 ? 9 : 10;
    
    return (
      <text
        x={centerX}
        y={y - 4}
        fill="#374151"
        fontSize={fontSize}
        fontWeight={600}
        textAnchor="middle"
        className="text-xs"
      >
        {formatDataPointLabel(value)}
      </text>
    );
  };




  if (chartData.length === 0) {
    return null;
  }

  if (chartData.length < 2) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 sm:p-8 text-center">
        <p className="text-sm sm:text-base text-gray-600">
          Net worth chart requires at least 2 SALN records to display trends.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-4 sm:mb-6">
        Assets, Liabilities & Net Worth Over Time
      </h3>
      <div className="w-full h-64 sm:h-80 lg:h-96 overflow-x-auto">
        <div className="w-full min-w-[300px] h-64 sm:h-80 lg:h-96">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{
                top: 20,
                right: 10,
                left: 10,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" vertical={false} />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 10, fill: '#6B7280' }}
                stroke="#9CA3AF"
                angle={chartData.length > 5 ? -45 : 0}
                textAnchor={chartData.length > 5 ? 'end' : 'middle'}
                height={chartData.length > 5 ? 60 : 30}
                interval="preserveStartEnd"
                className="text-xs"
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#6B7280' }}
                stroke="#9CA3AF"
                tickFormatter={formatYAxisLabel}
                width={60}
                className="text-xs"
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ paddingTop: '10px', fontSize: '11px' }}
                iconSize={10}
                formatter={(value) => (
                  <span className="text-[10px] sm:text-xs text-gray-700">{value}</span>
                )}
              />
            <Bar
              dataKey="assets"
              fill={ASSETS_GREEN}
              radius={[4, 4, 0, 0]}
              name="Assets"
            >
              <LabelList content={<BarLabel />} />
            </Bar>
            <Bar
              dataKey="liabilities"
              fill={LIABILITIES_RED}
              radius={[4, 4, 0, 0]}
              name="Liabilities"
            >
              <LabelList content={<BarLabel />} />
            </Bar>
            <Bar
              dataKey="netWorth"
              fill={NETWORTH_BLUE}
              radius={[4, 4, 0, 0]}
              name="Net Worth"
            >
              <LabelList content={<BarLabel />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        </div>
      </div>
      <p className="text-xs sm:text-sm text-gray-500 mt-3 sm:mt-4 text-center">
        Showing data from {chartData[0].year} to {chartData[chartData.length - 1].year}
      </p>
    </div>
  );
}
