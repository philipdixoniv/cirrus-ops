import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download } from "lucide-react";
import { useContent, useUpdateContent } from "@/hooks/useContent";
import { useProfile } from "@/contexts/ProfileContext";
import { ContentCard } from "@/components/ContentCard";
import { Pagination } from "@/components/Pagination";
import { StatusBadge } from "@/components/StatusBadge";
import { ExportDialog } from "@/components/ExportDialog";
import { formatContentType, formatDate, truncate } from "@/lib/utils";
import type { Content } from "@/api/client";

type ViewMode = "list" | "kanban";

export function ContentLibrary() {
  const { profileId } = useProfile();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [personaFilter, setPersonaFilter] = useState("");
  const [funnelFilter, setFunnelFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showExport, setShowExport] = useState(false);
  const limit = 50;
  const navigate = useNavigate();

  const profilePersonas: string[] = ((useProfile().activeProfile as any)?.personas) || [];

  const { data, isLoading } = useContent({
    profile_id: profileId,
    status: statusFilter || undefined,
    content_type: typeFilter || undefined,
    persona: personaFilter || undefined,
    funnel_stage: funnelFilter || undefined,
    limit,
    offset,
  });

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectedContent =
    data?.items.filter((c) => selectedIds.has(c.id)) || [];

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Content Library
          </h1>
          <p className="text-muted-foreground">
            All generated content with status workflow
          </p>
        </div>
        <div className="flex items-center gap-3">
          {selectedIds.size > 0 && (
            <button
              onClick={() => setShowExport(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md hover:bg-accent transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Export ({selectedIds.size})
            </button>
          )}
          <div className="flex gap-1 border rounded-md p-0.5">
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1 text-sm rounded ${
                viewMode === "list" ? "bg-primary text-primary-foreground" : ""
              }`}
            >
              List
            </button>
            <button
              onClick={() => setViewMode("kanban")}
              className={`px-3 py-1 text-sm rounded ${
                viewMode === "kanban" ? "bg-primary text-primary-foreground" : ""
              }`}
            >
              Kanban
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setOffset(0);
          }}
          className="text-sm border rounded-md px-3 py-1.5 bg-background"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="reviewed">Reviewed</option>
          <option value="published">Published</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setOffset(0);
          }}
          className="text-sm border rounded-md px-3 py-1.5 bg-background"
        >
          <option value="">All types</option>
          <option value="linkedin_post">LinkedIn Post</option>
          <option value="blog_post">Blog Post</option>
          <option value="tweet">Tweet</option>
          <option value="book_excerpt">Book Excerpt</option>
          <option value="case_study">Case Study</option>
        </select>
        {profilePersonas.length > 0 && (
          <select
            value={personaFilter}
            onChange={(e) => {
              setPersonaFilter(e.target.value);
              setOffset(0);
            }}
            className="text-sm border rounded-md px-3 py-1.5 bg-background"
          >
            <option value="">All personas</option>
            {profilePersonas.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}
        <select
          value={funnelFilter}
          onChange={(e) => {
            setFunnelFilter(e.target.value);
            setOffset(0);
          }}
          className="text-sm border rounded-md px-3 py-1.5 bg-background"
        >
          <option value="">All funnel stages</option>
          <option value="awareness">Awareness</option>
          <option value="consideration">Consideration</option>
          <option value="decision">Decision</option>
        </select>
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground">Loading content...</div>
      )}

      {viewMode === "list" && data && (
        <ContentListView
          items={data.items}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onClickItem={(c) => navigate(`/stories/${c.story_id}`)}
        />
      )}

      {viewMode === "kanban" && data && (
        <ContentKanbanView
          items={data.items}
          onClickItem={(c) => navigate(`/stories/${c.story_id}`)}
        />
      )}

      {data && (
        <Pagination
          total={data.total}
          limit={limit}
          offset={offset}
          onPageChange={setOffset}
        />
      )}

      {showExport && (
        <ExportDialog
          contents={selectedContent}
          onClose={() => {
            setShowExport(false);
            setSelectedIds(new Set());
          }}
        />
      )}
    </div>
  );
}

function ContentListView({
  items,
  selectedIds,
  onToggleSelect,
  onClickItem,
}: {
  items: Content[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onClickItem: (c: Content) => void;
}) {
  const updateMutation = useUpdateContent();

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No content found.
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-muted/50 text-left text-sm">
            <th className="px-4 py-2 font-medium w-10"></th>
            <th className="px-4 py-2 font-medium">Type</th>
            <th className="px-4 py-2 font-medium">Preview</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Tone</th>
            <th className="px-4 py-2 font-medium">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((c) => (
            <tr
              key={c.id}
              className="hover:bg-accent/50 cursor-pointer transition-colors"
              onClick={() => onClickItem(c)}
            >
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(c.id)}
                  onChange={() => onToggleSelect(c.id)}
                  className="rounded"
                />
              </td>
              <td className="px-4 py-3 text-sm font-medium">
                {formatContentType(c.content_type)}
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground max-w-md">
                {truncate(c.content, 100)}
              </td>
              <td className="px-4 py-3">
                <select
                  value={c.status}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    e.stopPropagation();
                    updateMutation.mutate({
                      id: c.id,
                      data: { status: e.target.value },
                    });
                  }}
                  className="text-xs border rounded px-1.5 py-0.5 bg-background"
                >
                  <option value="draft">draft</option>
                  <option value="reviewed">reviewed</option>
                  <option value="published">published</option>
                </select>
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground">
                {c.tone || "\u2014"}
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground">
                {formatDate(c.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContentKanbanView({
  items,
  onClickItem,
}: {
  items: Content[];
  onClickItem: (c: Content) => void;
}) {
  const columns = ["draft", "reviewed", "published"];

  return (
    <div className="grid grid-cols-3 gap-4">
      {columns.map((status) => {
        const colItems = items.filter((c) => c.status === status);
        return (
          <div key={status} className="space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <StatusBadge status={status} />
              <span className="text-sm text-muted-foreground">
                ({colItems.length})
              </span>
            </div>
            {colItems.map((c) => (
              <ContentCard
                key={c.id}
                content={c}
                onClick={() => onClickItem(c)}
              />
            ))}
            {colItems.length === 0 && (
              <div className="border border-dashed rounded-lg p-6 text-center text-sm text-muted-foreground">
                No {status} content
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
