import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, Loader2 } from "lucide-react";
import {
  useCampaign,
  useUpdateCampaign,
  useDeleteCampaign,
  useAddStoryToCampaign,
  useRemoveStoryFromCampaign,
} from "@/hooks/useCampaigns";
import { useCreateBrief, useGenerateFromBrief } from "@/hooks/useBriefs";
import { useProfile } from "@/contexts/ProfileContext";
import { StatusBadge } from "@/components/StatusBadge";
import { StoryCard } from "@/components/StoryCard";
import { ContentCard } from "@/components/ContentCard";
import { BriefCard } from "@/components/BriefCard";
import { BriefForm } from "@/components/BriefForm";
import { StoryPicker } from "@/components/StoryPicker";
import { formatDate } from "@/lib/utils";

type Tab = "stories" | "content" | "briefs";

export function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profileId, activeProfile } = useProfile();
  const { data: campaign, isLoading, refetch } = useCampaign(id || "");

  const updateMutation = useUpdateCampaign();
  const deleteMutation = useDeleteCampaign();
  const addStoryMutation = useAddStoryToCampaign();
  const removeStoryMutation = useRemoveStoryFromCampaign();
  const createBriefMutation = useCreateBrief();
  const generateMutation = useGenerateFromBrief();

  const [activeTab, setActiveTab] = useState<Tab>("stories");
  const [showStoryPicker, setShowStoryPicker] = useState(false);
  const [showBriefForm, setShowBriefForm] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [briefStoryIds, setBriefStoryIds] = useState<string[]>([]);
  const [showBriefStoryPicker, setShowBriefStoryPicker] = useState(false);

  if (isLoading) {
    return <div className="text-muted-foreground">Loading campaign...</div>;
  }

  if (!campaign) {
    return <div className="text-muted-foreground">Campaign not found.</div>;
  }

  const handleStatusChange = (status: string) => {
    updateMutation.mutate(
      { id: campaign.id, data: { status } },
      { onSuccess: () => refetch() }
    );
  };

  const handleFieldSave = (field: string) => {
    updateMutation.mutate(
      { id: campaign.id, data: { [field]: editValue } },
      {
        onSuccess: () => {
          setEditingField(null);
          refetch();
        },
      }
    );
  };

  const handleDelete = () => {
    if (confirm("Delete this campaign? This cannot be undone.")) {
      deleteMutation.mutate(campaign.id, {
        onSuccess: () => navigate("/campaigns"),
      });
    }
  };

  const handleAddStories = (storyIds: string[]) => {
    const existingIds = new Set(campaign.stories.map((s) => s.id));
    const newIds = storyIds.filter((id) => !existingIds.has(id));
    Promise.all(
      newIds.map((storyId) =>
        addStoryMutation.mutateAsync({ campaignId: campaign.id, storyId })
      )
    ).then(() => refetch());
  };

  const handleRemoveStory = (storyId: string) => {
    removeStoryMutation.mutate(
      { campaignId: campaign.id, storyId },
      { onSuccess: () => refetch() }
    );
  };

  const handleCreateBrief = (data: {
    title: string;
    objective?: string;
    key_messages?: string[];
    target_personas?: string[];
    tone_guidance?: string;
    linked_story_ids?: string[];
  }) => {
    if (!profileId) return;
    createBriefMutation.mutate(
      {
        ...data,
        profile_id: profileId,
        campaign_id: campaign.id,
        linked_story_ids: briefStoryIds.length > 0 ? briefStoryIds : data.linked_story_ids,
      },
      {
        onSuccess: () => {
          setShowBriefForm(false);
          setBriefStoryIds([]);
          refetch();
        },
      }
    );
  };

  const handleGenerateFromBrief = (briefId: string) => {
    const profile = activeProfile as any;
    const contentTypes = profile?.content_types?.map((ct: any) => ct.name) || [
      "linkedin_post",
      "blog_post",
    ];
    generateMutation.mutate(
      {
        brief_id: briefId,
        content_types: contentTypes.slice(0, 3),
        profile_name: activeProfile?.name || "default",
      },
      { onSuccess: () => refetch() }
    );
  };

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "stories", label: "Stories", count: campaign.stories.length },
    { key: "content", label: "Content", count: campaign.content.length },
    { key: "briefs", label: "Briefs", count: campaign.briefs.length },
  ];

  return (
    <div className="max-w-5xl space-y-6">
      <Link
        to="/campaigns"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Campaigns
      </Link>

      {/* Campaign header */}
      <div className="border rounded-lg p-6 bg-card space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            {editingField === "name" ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="text-xl font-bold border rounded px-2 py-1 bg-background flex-1"
                  autoFocus
                />
                <button
                  onClick={() => handleFieldSave("name")}
                  className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingField(null)}
                  className="px-3 py-1 text-sm border rounded"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <h1
                className="text-xl font-bold cursor-pointer hover:text-primary/80"
                onClick={() => {
                  setEditingField("name");
                  setEditValue(campaign.name);
                }}
              >
                {campaign.name}
              </h1>
            )}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={campaign.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="text-sm border rounded-md px-2 py-1 bg-background"
            >
              <option value="planning">Planning</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </select>
            <button
              onClick={handleDelete}
              className="p-1.5 text-muted-foreground hover:text-red-600 transition-colors"
              title="Delete campaign"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {editingField === "description" ? (
          <div className="space-y-2">
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              rows={3}
              className="w-full text-sm border rounded-md px-3 py-1.5 bg-background resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => handleFieldSave("description")}
                className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded"
              >
                Save
              </button>
              <button
                onClick={() => setEditingField(null)}
                className="px-3 py-1 text-sm border rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p
            className="text-sm text-muted-foreground cursor-pointer hover:text-foreground"
            onClick={() => {
              setEditingField("description");
              setEditValue(campaign.description || "");
            }}
          >
            {campaign.description || "Click to add a description..."}
          </p>
        )}

        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {campaign.target_audience && (
            <span>Audience: {campaign.target_audience}</span>
          )}
          <span>{campaign.story_count} stories</span>
          <span>{campaign.content_count} content pieces</span>
          <span>Created: {formatDate(campaign.created_at)}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Stories tab */}
      {activeTab === "stories" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowStoryPicker(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md hover:bg-accent transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Stories
            </button>
          </div>

          {campaign.stories.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No stories linked yet. Add stories to this campaign.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {campaign.stories.map((story) => (
                <div key={story.id} className="relative group">
                  <StoryCard story={story} />
                  <button
                    onClick={() => handleRemoveStory(story.id)}
                    className="absolute top-2 right-2 p-1 bg-card border rounded opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-600"
                    title="Remove from campaign"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Content tab */}
      {activeTab === "content" && (
        <div className="space-y-3">
          {campaign.content.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No content assigned to this campaign yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {campaign.content.map((c) => (
                <ContentCard
                  key={c.id}
                  content={c}
                  onClick={() => navigate(`/stories/${c.story_id}`)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Briefs tab */}
      {activeTab === "briefs" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowBriefForm(!showBriefForm)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md hover:bg-accent transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Create Brief
            </button>
          </div>

          {showBriefForm && (
            <BriefForm
              campaignId={campaign.id}
              availableStoryIds={briefStoryIds}
              onSubmit={handleCreateBrief}
              onCancel={() => {
                setShowBriefForm(false);
                setBriefStoryIds([]);
              }}
              isLoading={createBriefMutation.isPending}
              onPickStories={() => setShowBriefStoryPicker(true)}
            />
          )}

          {generateMutation.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating content from brief...
            </div>
          )}

          {campaign.briefs.length === 0 && !showBriefForm ? (
            <div className="text-center py-12 text-muted-foreground">
              No briefs yet. Create a brief to generate targeted content.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {campaign.briefs.map((brief) => (
                <BriefCard
                  key={brief.id}
                  brief={brief}
                  onGenerate={() => handleGenerateFromBrief(brief.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Story picker modal */}
      {showStoryPicker && (
        <StoryPicker
          selectedIds={campaign.stories.map((s) => s.id)}
          onSelect={handleAddStories}
          onClose={() => setShowStoryPicker(false)}
        />
      )}

      {/* Brief story picker modal */}
      {showBriefStoryPicker && (
        <StoryPicker
          selectedIds={briefStoryIds}
          onSelect={(ids) => setBriefStoryIds(ids)}
          onClose={() => setShowBriefStoryPicker(false)}
        />
      )}
    </div>
  );
}
