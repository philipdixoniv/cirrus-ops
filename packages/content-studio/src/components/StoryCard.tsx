import { Link } from "react-router-dom";
import { ThemeTag } from "./ThemeTag";
import { PersonaTag } from "./PersonaTag";
import { FunnelBadge } from "./FunnelBadge";
import { truncate, formatDate } from "@/lib/utils";
import type { Story } from "@/api/client";

const SENTIMENT_ICONS: Record<string, string> = {
  positive: "text-green-600",
  negative: "text-red-600",
  neutral: "text-gray-500",
  mixed: "text-amber-600",
};

export function StoryCard({ story }: { story: Story }) {
  return (
    <Link
      to={`/stories/${story.id}`}
      className="block border rounded-lg p-4 hover:border-primary/50 hover:shadow-sm transition-all bg-card"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="font-semibold text-sm leading-tight">{story.title}</h3>
        {story.confidence_score != null && (
          <span className="shrink-0 text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
            {Math.round(story.confidence_score * 100)}%
          </span>
        )}
      </div>

      {story.summary && (
        <p className="text-sm text-muted-foreground mb-3">
          {truncate(story.summary, 120)}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5 mb-3">
        {story.themes.map((t) => (
          <ThemeTag key={t} theme={t} />
        ))}
        {story.personas?.map((p) => (
          <PersonaTag key={p} persona={p} />
        ))}
        {story.funnel_stage && <FunnelBadge stage={story.funnel_stage} />}
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {story.sentiment && (
          <span className={SENTIMENT_ICONS[story.sentiment] || ""}>
            {story.sentiment}
          </span>
        )}
        {story.customer_company && <span>{story.customer_company}</span>}
        <span className="ml-auto">{formatDate(story.created_at)}</span>
      </div>
    </Link>
  );
}
