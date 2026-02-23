import { useState } from "react";
import { Save, Trash2, Loader2 } from "lucide-react";
import { useProfile } from "@/contexts/ProfileContext";
import { usePresets, useCreatePreset, useDeletePreset } from "@/hooks/useContent";
import type { Preset } from "@/api/client";

interface PresetSelectorProps {
  onSelect: (preset: { tone: string; custom_instructions: string }) => void;
  currentTone: string;
  currentInstructions: string;
}

export function PresetSelector({
  onSelect,
  currentTone,
  currentInstructions,
}: PresetSelectorProps) {
  const { profileId } = useProfile();
  const { data: presets } = usePresets(profileId);
  const createMutation = useCreatePreset();
  const deleteMutation = useDeletePreset();
  const [saveName, setSaveName] = useState("");
  const [showSave, setShowSave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleSave = () => {
    if (!saveName.trim() || !profileId) return;
    createMutation.mutate(
      {
        profile_id: profileId,
        name: saveName.trim(),
        tone: currentTone || undefined,
        custom_instructions: currentInstructions || undefined,
      },
      {
        onSuccess: () => {
          setSaveName("");
          setShowSave(false);
        },
      }
    );
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
    setConfirmDelete(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <select
          onChange={(e) => {
            const preset = presets?.find((p) => p.id === e.target.value);
            if (preset) {
              onSelect({
                tone: preset.tone || "",
                custom_instructions: preset.custom_instructions || "",
              });
            }
          }}
          defaultValue=""
          className="text-sm border rounded-md px-2 py-1 bg-background flex-1"
        >
          <option value="" disabled>
            Load preset...
          </option>
          {presets?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.tone ? ` (${p.tone})` : ""}
            </option>
          ))}
        </select>

        <button
          onClick={() => setShowSave(!showSave)}
          className="flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-accent transition-colors"
          title="Save current as preset"
        >
          <Save className="h-3 w-3" />
          Save
        </button>
      </div>

      {showSave && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Preset name..."
            className="flex-1 text-sm border rounded-md px-2 py-1 bg-background"
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
          <button
            onClick={handleSave}
            disabled={!saveName.trim() || createMutation.isPending}
            className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded-md disabled:opacity-50"
          >
            {createMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              "Save"
            )}
          </button>
        </div>
      )}

      {/* Preset list with delete */}
      {presets && presets.length > 0 && (
        <div className="space-y-1">
          {presets.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <button
                onClick={() =>
                  onSelect({
                    tone: p.tone || "",
                    custom_instructions: p.custom_instructions || "",
                  })
                }
                className="hover:text-foreground transition-colors truncate flex-1 text-left"
              >
                {p.name}
              </button>
              {confirmDelete === p.id ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="text-destructive text-xs"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="text-xs"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(p.id)}
                  className="hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
