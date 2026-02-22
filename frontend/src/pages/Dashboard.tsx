import { Link } from "react-router-dom";
import {
  BookOpen,
  FileText,
  Video,
  BarChart3,
  ArrowRight,
  Target,
} from "lucide-react";
import { useOverview } from "@/hooks/useAnalytics";
import { useStories } from "@/hooks/useStories";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useProfile } from "@/contexts/ProfileContext";
import { StoryCard } from "@/components/StoryCard";
import { CampaignCard } from "@/components/CampaignCard";
import { ActivityFeed } from "@/components/ActivityFeed";

export function Dashboard() {
  const { data: overview, isLoading } = useOverview();
  const { profileId } = useProfile();
  const { data: recentStories } = useStories({ limit: 6, offset: 0 });
  const { data: activeCampaigns } = useCampaigns({
    profile_id: profileId,
    status: "active",
    limit: 3,
  });

  const pipelineMap = new Map(
    overview?.pipeline?.map((p) => [p.status, p.count]) || []
  );

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Content Studio overview
        </p>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Meetings"
          value={isLoading ? "..." : String(overview?.total_meetings ?? 0)}
          icon={Video}
        />
        <MetricCard
          label="Stories Extracted"
          value={isLoading ? "..." : String(overview?.total_stories ?? 0)}
          icon={BookOpen}
        />
        <MetricCard
          label="Content Pieces"
          value={isLoading ? "..." : String(overview?.total_content ?? 0)}
          icon={FileText}
        />
        <MetricCard
          label="Published"
          value={isLoading ? "..." : String(pipelineMap.get("published") ?? 0)}
          icon={BarChart3}
        />
      </div>

      {/* Content pipeline */}
      {overview && overview.pipeline.length > 0 && (
        <div className="border rounded-lg p-4 bg-card">
          <h2 className="font-semibold mb-3">Content Pipeline</h2>
          <div className="flex gap-2 h-8">
            {["draft", "reviewed", "published"].map((status) => {
              const count = pipelineMap.get(status) || 0;
              const total = overview.total_content || 1;
              const pct = Math.max((count / total) * 100, 2);
              const colors: Record<string, string> = {
                draft: "bg-yellow-400",
                reviewed: "bg-blue-400",
                published: "bg-green-400",
              };
              return (
                <div
                  key={status}
                  className={`${colors[status]} rounded flex items-center justify-center text-xs font-medium text-white`}
                  style={{ width: `${pct}%` }}
                  title={`${status}: ${count}`}
                >
                  {count > 0 && `${status} (${count})`}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Active campaigns */}
      {activeCampaigns && activeCampaigns.items.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Active Campaigns</h2>
            <Link
              to="/campaigns"
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeCampaigns.items.map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} />
            ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <QuickAction to="/campaigns" label="Campaigns" icon={Target} />
        <QuickAction to="/stories" label="Browse Stories" icon={BookOpen} />
        <QuickAction to="/content" label="Content Library" icon={FileText} />
      </div>

      {/* Activity feed */}
      <div>
        <h2 className="font-semibold mb-3">Recent Activity</h2>
        <ActivityFeed />
      </div>

      {/* Recent stories */}
      {recentStories && recentStories.items.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Recent Stories</h2>
            <Link
              to="/stories"
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentStories.items.map((story) => (
              <StoryCard key={story.id} story={story} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <span className="text-2xl font-bold">{value}</span>
    </div>
  );
}

function QuickAction({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 border rounded-lg p-4 bg-card hover:border-primary/50 hover:shadow-sm transition-all"
    >
      <Icon className="h-5 w-5 text-muted-foreground" />
      <span className="text-sm font-medium">{label}</span>
      <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground" />
    </Link>
  );
}
