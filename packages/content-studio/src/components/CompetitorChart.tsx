import { useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useCompetitorMentions } from "@/hooks/useAnalytics";

export function CompetitorChart() {
  const { data } = useCompetitorMentions(15);
  const [selectedCompetitor, setSelectedCompetitor] = useState<string | null>(null);

  const selected = data?.find((m) => m.competitor === selectedCompetitor);

  return (
    <div className="border rounded-lg p-4 bg-card space-y-4">
      <h3 className="font-semibold">Competitor Mentions</h3>

      {data && data.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={data}
            layout="vertical"
            onClick={(e) => {
              if (e?.activeLabel) {
                setSelectedCompetitor(
                  selectedCompetitor === e.activeLabel ? null : e.activeLabel
                );
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" fontSize={12} />
            <YAxis
              type="category"
              dataKey="competitor"
              fontSize={12}
              width={100}
            />
            <Tooltip />
            <Bar
              dataKey="count"
              fill="#8b5cf6"
              radius={[0, 4, 4, 0]}
              cursor="pointer"
            />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
          No competitor mentions found
        </div>
      )}

      {/* Drill-down: stories for selected competitor */}
      {selected && selected.story_ids.length > 0 && (
        <div className="border-t pt-3">
          <h4 className="text-sm font-medium mb-2">
            Stories mentioning {selected.competitor} ({selected.count})
          </h4>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {selected.story_ids.slice(0, 10).map((sid) => (
              <Link
                key={sid}
                to={`/stories/${sid}`}
                className="block text-sm text-blue-600 hover:underline truncate"
              >
                {sid}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
