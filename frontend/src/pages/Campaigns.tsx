import { useState } from "react";
import { Plus } from "lucide-react";
import { useCampaigns, useCreateCampaign } from "@/hooks/useCampaigns";
import { useProfile } from "@/contexts/ProfileContext";
import { CampaignCard } from "@/components/CampaignCard";
import { CampaignForm } from "@/components/CampaignForm";
import { Pagination } from "@/components/Pagination";

export function Campaigns() {
  const { profileId } = useProfile();
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const { data, isLoading } = useCampaigns({
    profile_id: profileId,
    status: statusFilter || undefined,
    limit,
    offset,
  });

  const createMutation = useCreateCampaign();

  const handleCreate = (formData: {
    name: string;
    description?: string;
    target_audience?: string;
    status?: string;
  }) => {
    if (!profileId) return;
    createMutation.mutate(
      { ...formData, profile_id: profileId },
      {
        onSuccess: () => setShowCreate(false),
      }
    );
  };

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
          <p className="text-muted-foreground">
            Organize content around marketing objectives
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          New Campaign
        </button>
      </div>

      {/* Status filter */}
      <div className="flex gap-3">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setOffset(0);
          }}
          className="text-sm border rounded-md px-3 py-1.5 bg-background"
        >
          <option value="">All statuses</option>
          <option value="planning">Planning</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {/* Create form */}
      {showCreate && (
        <CampaignForm
          onSubmit={handleCreate}
          onCancel={() => setShowCreate(false)}
          isLoading={createMutation.isPending}
        />
      )}

      {isLoading && (
        <div className="text-sm text-muted-foreground">Loading campaigns...</div>
      )}

      {data && data.items.length === 0 && !showCreate && (
        <div className="text-center py-12 text-muted-foreground">
          <p>No campaigns yet. Create your first campaign to get started.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {data?.items.map((campaign) => (
          <CampaignCard key={campaign.id} campaign={campaign} />
        ))}
      </div>

      {data && (
        <Pagination
          total={data.total}
          limit={limit}
          offset={offset}
          onPageChange={setOffset}
        />
      )}
    </div>
  );
}
