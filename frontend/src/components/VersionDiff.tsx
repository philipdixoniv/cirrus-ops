import { useState, useMemo } from "react";
import { useContentVersions } from "@/hooks/useContent";
import { computeDiff } from "@/lib/diff";

interface VersionDiffProps {
  contentId: string;
}

export function VersionDiff({ contentId }: VersionDiffProps) {
  const { data: versions } = useContentVersions(contentId);
  const [versionA, setVersionA] = useState<string>("");
  const [versionB, setVersionB] = useState<string>("");

  // Auto-select the two most recent versions
  const sortedVersions = useMemo(() => {
    if (!versions) return [];
    return [...versions].sort(
      (a, b) => (a.version || 1) - (b.version || 1)
    );
  }, [versions]);

  // Default selection
  const aId = versionA || sortedVersions[sortedVersions.length - 2]?.id || "";
  const bId = versionB || sortedVersions[sortedVersions.length - 1]?.id || "";

  const contentA = sortedVersions.find((v) => v.id === aId)?.content || "";
  const contentB = sortedVersions.find((v) => v.id === bId)?.content || "";

  const diffSegments = useMemo(
    () => (contentA && contentB ? computeDiff(contentA, contentB) : []),
    [contentA, contentB]
  );

  if (!versions || versions.length < 2) {
    return (
      <div className="border rounded-lg p-4 bg-card text-sm text-muted-foreground">
        Need at least 2 versions to compare.
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-4 bg-card space-y-3">
      <h3 className="font-semibold text-sm">Version Diff</h3>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Version A:</label>
          <select
            value={aId}
            onChange={(e) => setVersionA(e.target.value)}
            className="text-sm border rounded-md px-2 py-1 bg-background"
          >
            {sortedVersions.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.version || 1}
                {v.tone ? ` (${v.tone})` : ""}
              </option>
            ))}
          </select>
        </div>

        <span className="text-muted-foreground">vs</span>

        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Version B:</label>
          <select
            value={bId}
            onChange={(e) => setVersionB(e.target.value)}
            className="text-sm border rounded-md px-2 py-1 bg-background"
          >
            {sortedVersions.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.version || 1}
                {v.tone ? ` (${v.tone})` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Diff output */}
      <div className="border rounded-md p-4 bg-muted/20 text-sm leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">
        {diffSegments.map((seg, i) => {
          if (seg.type === "equal") {
            return <span key={i}>{seg.text}</span>;
          }
          if (seg.type === "added") {
            return (
              <span
                key={i}
                className="bg-green-200 text-green-900 dark:bg-green-900/40 dark:text-green-300"
              >
                {seg.text}
              </span>
            );
          }
          return (
            <span
              key={i}
              className="bg-red-200 text-red-900 line-through dark:bg-red-900/40 dark:text-red-300"
            >
              {seg.text}
            </span>
          );
        })}
      </div>
    </div>
  );
}
