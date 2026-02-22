import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useContent } from "@/hooks/useContent";
import { useProfile } from "@/contexts/ProfileContext";
import { StatusBadge } from "@/components/StatusBadge";
import { formatContentType } from "@/lib/utils";
import type { Content } from "@/api/client";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function ContentCalendar() {
  const navigate = useNavigate();
  const { profileId } = useProfile();
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Fetch all content for this month
  const { data } = useContent({
    profile_id: profileId,
    limit: 200,
    offset: 0,
  });

  // Group content by day
  const contentByDay = useMemo(() => {
    const map = new Map<number, Content[]>();
    if (!data) return map;
    for (const item of data.items) {
      if (!item.created_at) continue;
      const d = new Date(item.created_at);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        if (!map.has(day)) map.set(day, []);
        map.get(day)!.push(item);
      }
    }
    return map;
  }, [data, year, month]);

  // Calendar grid
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  const cells: Array<{ day: number | null; content: Content[] }> = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - firstDay + 1;
    if (dayNum >= 1 && dayNum <= daysInMonth) {
      cells.push({ day: dayNum, content: contentByDay.get(dayNum) || [] });
    } else {
      cells.push({ day: null, content: [] });
    }
  }

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const statusColor: Record<string, string> = {
    draft: "bg-yellow-400",
    reviewed: "bg-blue-400",
    published: "bg-green-400",
  };

  return (
    <div className="max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Content Calendar</h1>
        <p className="text-muted-foreground">
          Visualize your content pipeline over time
        </p>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={prevMonth}
          className="p-2 border rounded-md hover:bg-accent transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 className="text-lg font-semibold">
          {MONTHS[month]} {year}
        </h2>
        <button
          onClick={nextMonth}
          className="p-2 border rounded-md hover:bg-accent transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Calendar grid */}
      <div className="border rounded-lg overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 bg-muted/50">
          {DAYS.map((d) => (
            <div
              key={d}
              className="px-2 py-2 text-xs font-medium text-muted-foreground text-center border-b"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {cells.map((cell, i) => (
            <div
              key={i}
              className={`min-h-[100px] border-b border-r p-1.5 ${
                cell.day === null ? "bg-muted/20" : "bg-card"
              }`}
            >
              {cell.day !== null && (
                <>
                  <span className="text-xs font-medium text-muted-foreground">
                    {cell.day}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {cell.content.slice(0, 3).map((c) => (
                      <button
                        key={c.id}
                        onClick={() => navigate(`/stories/${c.story_id}`)}
                        className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] font-medium text-white truncate ${
                          statusColor[c.status] || "bg-gray-400"
                        }`}
                        title={`${formatContentType(c.content_type)} (${c.status})`}
                      >
                        {formatContentType(c.content_type)}
                      </button>
                    ))}
                    {cell.content.length > 3 && (
                      <span className="text-[10px] text-muted-foreground px-1">
                        +{cell.content.length - 3} more
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {Object.entries(statusColor).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded ${color}`} />
            <span className="capitalize">{status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
