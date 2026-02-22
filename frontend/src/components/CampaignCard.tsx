import { Link } from "react-router-dom";
import { StatusBadge } from "./StatusBadge";
import { formatDate } from "@/lib/utils";
import type { Campaign } from "@/api/client";

export function CampaignCard({ campaign }: { campaign: Campaign }) {
  return (
    <Link
      to={`/campaigns/${campaign.id}`}
      className="block border rounded-lg p-4 hover:border-primary/50 hover:shadow-sm transition-all bg-card"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="font-semibold text-sm leading-tight">{campaign.name}</h3>
        <StatusBadge status={campaign.status} />
      </div>

      {campaign.description && (
        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
          {campaign.description}
        </p>
      )}

      {campaign.target_audience && (
        <p className="text-xs text-muted-foreground mb-2">
          Audience: {campaign.target_audience}
        </p>
      )}

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{campaign.story_count} stories</span>
        <span>{campaign.content_count} content</span>
        <span className="ml-auto">{formatDate(campaign.created_at)}</span>
      </div>
    </Link>
  );
}
