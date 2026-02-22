import { Link } from "react-router-dom";
import { BookOpen, FileText, Clock } from "lucide-react";
import { useActivity } from "@/hooks/useAnalytics";
import { formatDateTime } from "@/lib/utils";

export function ActivityFeed() {
  const { data: items, isLoading } = useActivity(15);

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground">Loading activity...</div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">No recent activity.</div>
    );
  }

  const iconMap: Record<string, typeof BookOpen> = {
    story_extracted: BookOpen,
    content_generated: FileText,
  };

  return (
    <div className="border rounded-lg bg-card divide-y">
      {items.map((item, i) => {
        const Icon = iconMap[item.type] || Clock;
        return (
          <Link
            key={`${item.entity_id}-${i}`}
            to={`/stories/${item.entity_id}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{item.title}</p>
              <p className="text-xs text-muted-foreground">{item.detail}</p>
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {formatDateTime(item.created_at)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
