import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, RefreshCw, ChevronDown, Zap, Shuffle, Eye, Edit3, GitCompare } from "lucide-react";
import { useStory, useStoryContent } from "@/hooks/useStories";
import { useContentVersions, useUpdateContent, useRegenerate } from "@/hooks/useContent";
import { ThemeTag } from "@/components/ThemeTag";
import { PersonaTag } from "@/components/PersonaTag";
import { FunnelBadge } from "@/components/FunnelBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { ContentEditor } from "@/components/ContentEditor";
import { RegeneratePanel } from "@/components/RegeneratePanel";
import { BulkGeneratePanel } from "@/components/BulkGeneratePanel";
import { LinkedInPreview } from "@/components/LinkedInPreview";
import { TweetPreview } from "@/components/TweetPreview";
import { BlogPreview } from "@/components/BlogPreview";
import { VersionDiff } from "@/components/VersionDiff";
import { ExportDialog } from "@/components/ExportDialog";
import { ApprovalWorkflow } from "@/components/ApprovalWorkflow";
import { formatDate, formatContentType } from "@/lib/utils";
import type { Content } from "@/api/client";

type ViewMode = "edit" | "preview";

export function StoryDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: story, isLoading: storyLoading } = useStory(id || "");
  const { data: contentList, refetch: refetchContent } = useStoryContent(
    id || ""
  );

  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [showBulkGenerate, setShowBulkGenerate] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("edit");
  const [showDiff, setShowDiff] = useState(false);
  const [showExport, setShowExport] = useState(false);

  // Group content by type, pick latest version for each
  const contentByType = new Map<string, Content>();
  if (contentList) {
    for (const c of contentList) {
      const existing = contentByType.get(c.content_type);
      if (
        !existing ||
        (c.version || 0) > (existing.version || 0)
      ) {
        contentByType.set(c.content_type, c);
      }
    }
  }

  const contentTypes = Array.from(contentByType.keys());
  const selectedType = activeTab || contentTypes[0] || null;
  const selectedContent = selectedType
    ? contentByType.get(selectedType)
    : null;

  if (storyLoading) {
    return <div className="text-muted-foreground">Loading story...</div>;
  }

  if (!story) {
    return <div className="text-muted-foreground">Story not found.</div>;
  }

  return (
    <div className="max-w-5xl space-y-6">
      {/* Back link */}
      <Link
        to="/stories"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Stories
      </Link>

      {/* Story header */}
      <div className="border rounded-lg p-6 bg-card space-y-4">
        <h1 className="text-xl font-bold">{story.title}</h1>

        <div className="flex flex-wrap gap-2">
          {story.themes.map((t) => (
            <ThemeTag key={t} theme={t} />
          ))}
          {story.personas?.map((p) => (
            <PersonaTag key={p} persona={p} />
          ))}
          {story.funnel_stage && <FunnelBadge stage={story.funnel_stage} />}
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {story.customer_company && (
            <span>Company: {story.customer_company}</span>
          )}
          {story.customer_name && <span>Contact: {story.customer_name}</span>}
          {story.sentiment && <span>Sentiment: {story.sentiment}</span>}
          {story.confidence_score != null && (
            <span>Confidence: {Math.round(story.confidence_score * 100)}%</span>
          )}
          <span>Extracted: {formatDate(story.created_at)}</span>
        </div>

        {story.summary && (
          <div>
            <h3 className="text-sm font-medium mb-1">Summary</h3>
            <p className="text-sm text-muted-foreground">{story.summary}</p>
          </div>
        )}

        {story.story_text && (
          <div>
            <h3 className="text-sm font-medium mb-1">Story Text</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {story.story_text}
            </p>
          </div>
        )}
      </div>

      {/* Content section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Generated Content</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBulkGenerate(!showBulkGenerate)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md hover:bg-accent transition-colors"
            >
              <Zap className="h-3.5 w-3.5" />
              Generate Content
            </button>
            {selectedContent && (
              <button
                onClick={() => setShowExport(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md hover:bg-accent transition-colors"
              >
                Export
              </button>
            )}
          </div>
        </div>

        {/* Bulk generate panel */}
        {showBulkGenerate && (
          <BulkGeneratePanel
            storyId={id || ""}
            existingTypes={contentTypes}
            onClose={() => setShowBulkGenerate(false)}
            onSuccess={() => refetchContent()}
          />
        )}

        {contentTypes.length === 0 && !showBulkGenerate && (
          <p className="text-sm text-muted-foreground">
            No content generated yet for this story.
          </p>
        )}

        {contentTypes.length > 0 && (
          <>
            {/* Content type tabs */}
            <div className="flex gap-1 border-b">
              {contentTypes.map((ct) => (
                <button
                  key={ct}
                  onClick={() => {
                    setActiveTab(ct);
                    setShowRegenerate(false);
                    setShowDiff(false);
                    setViewMode("edit");
                  }}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    selectedType === ct
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {formatContentType(ct)}
                </button>
              ))}
            </div>

            {selectedContent && (
              <div className="space-y-4">
                {/* Status + version controls */}
                <ContentControls
                  content={selectedContent}
                  onShowRegenerate={() => setShowRegenerate(!showRegenerate)}
                  viewMode={viewMode}
                  onToggleView={() => setViewMode(viewMode === "edit" ? "preview" : "edit")}
                  onShowDiff={() => setShowDiff(!showDiff)}
                  storyId={id || ""}
                  contentTypes={contentTypes}
                />

                {/* Approval workflow */}
                <ApprovalWorkflow
                  contentId={selectedContent.id}
                  approvalChain={selectedContent.approval_chain || []}
                />

                {/* Regenerate panel */}
                {showRegenerate && (
                  <RegeneratePanel
                    contentId={selectedContent.id}
                    onClose={() => setShowRegenerate(false)}
                    onSuccess={() => refetchContent()}
                  />
                )}

                {/* Version diff */}
                {showDiff && (
                  <VersionDiff contentId={selectedContent.id} />
                )}

                {/* Version history */}
                <VersionHistory content={selectedContent} />

                {/* Editor or Preview */}
                {viewMode === "edit" ? (
                  <ContentEditor content={selectedContent} />
                ) : (
                  <SocialPreview content={selectedContent} />
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Export dialog */}
      {showExport && selectedContent && (
        <ExportDialog
          contents={[selectedContent]}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}

function SocialPreview({ content }: { content: Content }) {
  const type = content.content_type;
  if (type === "linkedin_post") {
    return <LinkedInPreview content={content.content} />;
  }
  if (type === "tweet") {
    return <TweetPreview content={content.content} />;
  }
  if (type === "blog_post" || type === "book_excerpt" || type === "case_study") {
    return <BlogPreview content={content.content} title={formatContentType(content.content_type)} />;
  }
  // Fallback: just show the text
  return (
    <div className="border rounded-lg p-6 bg-card">
      <p className="text-sm whitespace-pre-wrap">{content.content}</p>
    </div>
  );
}

function ContentControls({
  content,
  onShowRegenerate,
  viewMode,
  onToggleView,
  onShowDiff,
  storyId,
  contentTypes,
}: {
  content: Content;
  onShowRegenerate: () => void;
  viewMode: ViewMode;
  onToggleView: () => void;
  onShowDiff: () => void;
  storyId: string;
  contentTypes: string[];
}) {
  const updateMutation = useUpdateContent();
  const remixMutation = useRegenerate();
  const [statusNote, setStatusNote] = useState("");
  const [showNoteInput, setShowNoteInput] = useState(false);

  const handleStatusChange = (newStatus: string) => {
    setShowNoteInput(true);
    // We'll save the status after the user optionally adds a note
    updateMutation.mutate({
      id: content.id,
      data: { status: newStatus, status_note: statusNote || undefined },
    });
  };

  const handleRemix = (targetType: string) => {
    remixMutation.mutate({
      content_id: content.id,
      content_type: targetType,
    });
  };

  const remixTargets = [
    "linkedin_post",
    "blog_post",
    "tweet",
    "book_excerpt",
    "case_study",
  ].filter((t) => t !== content.content_type);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <StatusBadge status={content.status} />

        <select
          value={content.status}
          onChange={(e) => handleStatusChange(e.target.value)}
          className="text-sm border rounded-md px-2 py-1 bg-background"
        >
          <option value="draft">Draft</option>
          <option value="reviewed">Reviewed</option>
          <option value="published">Published</option>
        </select>

        {content.tone && (
          <span className="text-xs text-muted-foreground">
            Tone: {content.tone}
          </span>
        )}

        {content.status_note && (
          <span className="text-xs text-muted-foreground italic">
            Note: {content.status_note}
          </span>
        )}

        {content.campaign_id && (
          <Link
            to={`/campaigns/${content.campaign_id}`}
            className="text-xs text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            Campaign
          </Link>
        )}

        <div className="flex-1" />

        {/* View toggle */}
        <button
          onClick={onToggleView}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md hover:bg-accent transition-colors"
          title={viewMode === "edit" ? "Preview" : "Edit"}
        >
          {viewMode === "edit" ? (
            <><Eye className="h-3.5 w-3.5" /> Preview</>
          ) : (
            <><Edit3 className="h-3.5 w-3.5" /> Edit</>
          )}
        </button>

        {/* Diff button */}
        <button
          onClick={onShowDiff}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md hover:bg-accent transition-colors"
          title="Compare versions"
        >
          <GitCompare className="h-3.5 w-3.5" />
          Diff
        </button>

        {/* Remix dropdown */}
        <div className="relative group">
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md hover:bg-accent transition-colors">
            <Shuffle className="h-3.5 w-3.5" />
            Remix
            <ChevronDown className="h-3 w-3" />
          </button>
          <div className="absolute right-0 top-full mt-1 bg-card border rounded-md shadow-lg py-1 z-10 hidden group-hover:block min-w-[160px]">
            {remixTargets.map((t) => (
              <button
                key={t}
                onClick={() => handleRemix(t)}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors"
              >
                {formatContentType(t)}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={onShowRegenerate}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md hover:bg-accent transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Regenerate
        </button>
      </div>

      {/* Status note input */}
      {showNoteInput && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={statusNote}
            onChange={(e) => setStatusNote(e.target.value)}
            placeholder="Add a note about this status change..."
            className="flex-1 text-sm border rounded-md px-3 py-1.5 bg-background"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                updateMutation.mutate({
                  id: content.id,
                  data: { status_note: statusNote },
                });
                setShowNoteInput(false);
                setStatusNote("");
              }
            }}
          />
          <button
            onClick={() => {
              updateMutation.mutate({
                id: content.id,
                data: { status_note: statusNote },
              });
              setShowNoteInput(false);
              setStatusNote("");
            }}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md"
          >
            Save
          </button>
          <button
            onClick={() => {
              setShowNoteInput(false);
              setStatusNote("");
            }}
            className="px-3 py-1.5 text-sm border rounded-md"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function VersionHistory({ content }: { content: Content }) {
  const { data: versions } = useContentVersions(content.id);
  const [open, setOpen] = useState(false);

  if (!versions || versions.length <= 1) return null;

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
        {versions.length} versions
      </button>
      {open && (
        <div className="mt-2 border rounded-md divide-y max-h-48 overflow-y-auto">
          {versions.map((v) => (
            <div
              key={v.id}
              className="px-3 py-2 text-sm flex items-center gap-3"
            >
              <span className="font-mono text-xs">v{v.version || 1}</span>
              <span className="text-muted-foreground">
                {formatDate(v.created_at)}
              </span>
              {v.tone && (
                <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                  {v.tone}
                </span>
              )}
              <StatusBadge status={v.status} />
              {(v as Content & { status_note?: string }).status_note && (
                <span className="text-xs text-muted-foreground italic">
                  {(v as Content & { status_note?: string }).status_note}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
