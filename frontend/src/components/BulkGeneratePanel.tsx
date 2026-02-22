import { useState } from "react";
import { Loader2, Zap, X } from "lucide-react";
import { useProfile } from "@/contexts/ProfileContext";
import { batchGenerate } from "@/api/client";
import type { Content } from "@/api/client";

interface BulkGeneratePanelProps {
  storyId: string;
  existingTypes: string[];
  onClose: () => void;
  onSuccess: () => void;
}

const DEFAULT_CONTENT_TYPES = [
  "linkedin_post",
  "blog_post",
  "tweet",
  "book_excerpt",
  "case_study",
];

export function BulkGeneratePanel({
  storyId,
  existingTypes,
  onClose,
  onSuccess,
}: BulkGeneratePanelProps) {
  const { activeProfile } = useProfile();
  const [selected, setSelected] = useState<Set<string>>(() => {
    const notYetGenerated = DEFAULT_CONTENT_TYPES.filter(
      (t) => !existingTypes.includes(t)
    );
    return new Set(notYetGenerated.length > 0 ? notYetGenerated : DEFAULT_CONTENT_TYPES);
  });
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const toggle = (type: string) => {
    const next = new Set(selected);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    setSelected(next);
  };

  const handleGenerate = async () => {
    if (selected.size === 0) return;
    setGenerating(true);
    setError(null);
    setProgress(new Set(selected));
    try {
      await batchGenerate(
        storyId,
        Array.from(selected),
        activeProfile?.name || "default"
      );
      onSuccess();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
      setProgress(new Set());
    }
  };

  const formatType = (t: string) =>
    t.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  return (
    <div className="border rounded-lg p-4 bg-card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Zap className="h-4 w-4" />
          Bulk Generate Content
        </h3>
        <button onClick={onClose}>
          <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
        </button>
      </div>

      <div className="space-y-2">
        {DEFAULT_CONTENT_TYPES.map((type) => {
          const isExisting = existingTypes.includes(type);
          const isRunning = progress.has(type);
          return (
            <label
              key={type}
              className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent/50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.has(type)}
                onChange={() => toggle(type)}
                disabled={generating}
                className="rounded"
              />
              <span className="text-sm flex-1">{formatType(type)}</span>
              {isExisting && (
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  exists
                </span>
              )}
              {isRunning && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              )}
            </label>
          );
        })}
      </div>

      <button
        onClick={handleGenerate}
        disabled={generating || selected.size === 0}
        className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {generating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating {selected.size} types...
          </>
        ) : (
          <>
            <Zap className="h-4 w-4" />
            Generate Selected ({selected.size})
          </>
        )}
      </button>

      {error && (
        <p className="text-sm text-destructive">Error: {error}</p>
      )}
    </div>
  );
}
