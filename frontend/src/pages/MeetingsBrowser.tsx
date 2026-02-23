import { useState } from "react";
import { useMeetings, useExtractStories } from "@/hooks/useMeetings";
import { useProfile } from "@/contexts/ProfileContext";
import { Pagination } from "@/components/Pagination";
import { formatDateTime } from "@/lib/utils";
import { BookOpen, Loader2, Video } from "lucide-react";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { EmptyState } from "@/components/ui/EmptyState";

export function MeetingsBrowser() {
  const { activeProfile } = useProfile();
  const [platform, setPlatform] = useState("");
  const [offset, setOffset] = useState(0);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const limit = 50;

  const { data, isLoading } = useMeetings({
    platform: platform || undefined,
    limit,
    offset,
  });

  const extractMutation = useExtractStories();

  const handleExtract = (meetingId: string) => {
    setExtractingId(meetingId);
    extractMutation.mutate(
      { meetingId, profileName: activeProfile?.name },
      { onSettled: () => setExtractingId(null) }
    );
  };

  return (
    <div className="max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Meetings</h1>
        <p className="text-muted-foreground">
          Browse synced meetings and extract stories
        </p>
      </div>

      <div className="flex gap-3">
        <select
          value={platform}
          onChange={(e) => {
            setPlatform(e.target.value);
            setOffset(0);
          }}
          className="text-sm border rounded-md px-3 py-1.5 bg-background"
          aria-label="Filter by platform"
        >
          <option value="">All platforms</option>
          <option value="gong">Gong</option>
          <option value="zoom">Zoom</option>
        </select>
      </div>

      {isLoading && <TableSkeleton rows={5} columns={6} />}

      {data && data.items.length === 0 && (
        <EmptyState
          icon={Video}
          title="No meetings found"
          description="Meetings will appear here once synced from your connected platforms."
        />
      )}

      {data && data.items.length > 0 && (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="bg-muted/50 text-left text-sm">
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">Platform</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Duration</th>
                <th className="px-4 py-2 font-medium">Host</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.items.map((m) => (
                <tr key={m.id} className="hover:bg-accent/50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium max-w-xs truncate">
                    {m.title || "Untitled"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted">
                      {m.platform}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {formatDateTime(m.started_at)}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {m.duration_seconds
                      ? `${Math.round(m.duration_seconds / 60)} min`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {m.host_name || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleExtract(m.id)}
                      disabled={extractingId === m.id}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      {extractingId === m.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <BookOpen className="h-3.5 w-3.5" />
                      )}
                      Extract
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
