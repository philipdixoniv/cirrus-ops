import { useProfile } from "@/contexts/ProfileContext";
import {
  useThemesOverTime,
  useSentimentBreakdown,
  useTopCompanies,
  useContentPipeline,
} from "@/hooks/useAnalytics";
import { CompetitorChart } from "@/components/CompetitorChart";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";

const CHART_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#ec4899",
  "#14b8a6",
  "#6366f1",
];

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "#10b981",
  negative: "#ef4444",
  neutral: "#6b7280",
  mixed: "#f59e0b",
  unknown: "#9ca3af",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "#f59e0b",
  reviewed: "#3b82f6",
  published: "#10b981",
};

export function Analytics() {
  const { profileId } = useProfile();
  const { data: themesData } = useThemesOverTime(12);
  const { data: sentimentData } = useSentimentBreakdown(profileId);
  const { data: companiesData } = useTopCompanies(10);
  const { data: pipelineData } = useContentPipeline(profileId);

  // Transform themes-over-time data for the line chart
  const themeMonths = new Map<string, Record<string, number>>();
  const allThemes = new Set<string>();
  if (themesData) {
    for (const point of themesData) {
      allThemes.add(point.theme);
      if (!themeMonths.has(point.month)) {
        themeMonths.set(point.month, {});
      }
      themeMonths.get(point.month)![point.theme] = point.count;
    }
  }
  const lineData = Array.from(themeMonths.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, themes]) => ({ month, ...themes }));
  const themeList = Array.from(allThemes).slice(0, 8);

  return (
    <div className="max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">
          Trends and insights across your content pipeline
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Themes over time */}
        <div className="border rounded-lg p-4 bg-card">
          <h3 className="font-semibold mb-4">Themes Over Time</h3>
          {lineData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Legend />
                {themeList.map((theme, i) => (
                  <Line
                    key={theme}
                    type="monotone"
                    dataKey={theme}
                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
              No theme data available
            </div>
          )}
        </div>

        {/* Sentiment distribution */}
        <div className="border rounded-lg p-4 bg-card">
          <h3 className="font-semibold mb-4">Sentiment Distribution</h3>
          {sentimentData && sentimentData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={sentimentData}
                  dataKey="count"
                  nameKey="sentiment"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ sentiment, percentage }) =>
                    `${sentiment} (${percentage}%)`
                  }
                >
                  {sentimentData.map((entry) => (
                    <Cell
                      key={entry.sentiment}
                      fill={SENTIMENT_COLORS[entry.sentiment] || "#9ca3af"}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
              No sentiment data available
            </div>
          )}
        </div>

        {/* Top companies */}
        <div className="border rounded-lg p-4 bg-card">
          <h3 className="font-semibold mb-4">Top Companies</h3>
          {companiesData && companiesData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={companiesData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" fontSize={12} />
                <YAxis
                  type="category"
                  dataKey="company"
                  fontSize={12}
                  width={120}
                />
                <Tooltip />
                <Bar dataKey="story_count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
              No company data available
            </div>
          )}
        </div>

        {/* Content pipeline */}
        <div className="border rounded-lg p-4 bg-card">
          <h3 className="font-semibold mb-4">Content Pipeline</h3>
          {pipelineData && pipelineData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={pipelineData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="status" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {pipelineData.map((entry) => (
                    <Cell
                      key={entry.status}
                      fill={STATUS_COLORS[entry.status] || "#6b7280"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
              No pipeline data available
            </div>
          )}
        </div>

        {/* Competitor mentions */}
        <div className="lg:col-span-2">
          <CompetitorChart />
        </div>
      </div>
    </div>
  );
}
