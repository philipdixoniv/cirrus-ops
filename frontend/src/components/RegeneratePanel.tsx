import { useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { useRegenerate } from "@/hooks/useContent";
import { PresetSelector } from "./PresetSelector";

const TONES = [
  "professional",
  "conversational",
  "witty",
  "serious",
  "inspirational",
];

interface RegeneratePanelProps {
  contentId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function RegeneratePanel({
  contentId,
  onClose,
  onSuccess,
}: RegeneratePanelProps) {
  const [tone, setTone] = useState("");
  const [instructions, setInstructions] = useState("");
  const regenerate = useRegenerate();

  const handleRegenerate = () => {
    regenerate.mutate(
      {
        content_id: contentId,
        tone: tone || undefined,
        custom_instructions: instructions || undefined,
      },
      {
        onSuccess: () => {
          onSuccess?.();
          onClose();
        },
      }
    );
  };

  const handlePresetSelect = (preset: {
    tone: string;
    custom_instructions: string;
  }) => {
    setTone(preset.tone);
    setInstructions(preset.custom_instructions);
  };

  return (
    <div className="border rounded-lg p-4 bg-card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Regenerate Content</h3>
        <button onClick={onClose}>
          <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
        </button>
      </div>

      {/* Preset selector */}
      <PresetSelector
        onSelect={handlePresetSelect}
        currentTone={tone}
        currentInstructions={instructions}
      />

      <div>
        <label className="block text-sm font-medium mb-1.5">Tone</label>
        <div className="flex flex-wrap gap-2">
          {TONES.map((t) => (
            <button
              key={t}
              onClick={() => setTone(tone === t ? "" : t)}
              className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                tone === t
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-accent"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">
          Custom Instructions
        </label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder='e.g. "Make it more conversational", "Add a CTA", "Emphasize ROI"'
          rows={3}
          className="w-full border rounded-md px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <button
        onClick={handleRegenerate}
        disabled={regenerate.isPending}
        className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        <RefreshCw
          className={`h-4 w-4 ${regenerate.isPending ? "animate-spin" : ""}`}
        />
        {regenerate.isPending ? "Regenerating..." : "Regenerate"}
      </button>

      {regenerate.isError && (
        <p className="text-sm text-destructive">
          Error: {(regenerate.error as Error).message}
        </p>
      )}
    </div>
  );
}
