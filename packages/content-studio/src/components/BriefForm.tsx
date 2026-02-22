import { useState } from "react";
import { X } from "lucide-react";
import { useProfile } from "@/contexts/ProfileContext";

interface BriefFormProps {
  campaignId?: string;
  availableStoryIds?: string[];
  onSubmit: (data: {
    title: string;
    objective?: string;
    key_messages?: string[];
    target_personas?: string[];
    tone_guidance?: string;
    linked_story_ids?: string[];
    status?: string;
  }) => void;
  onCancel: () => void;
  isLoading?: boolean;
  onPickStories?: () => void;
}

export function BriefForm({
  onSubmit,
  onCancel,
  isLoading,
  onPickStories,
  availableStoryIds = [],
}: BriefFormProps) {
  const { activeProfile } = useProfile();
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [keyMessageInput, setKeyMessageInput] = useState("");
  const [keyMessages, setKeyMessages] = useState<string[]>([]);
  const [selectedPersonas, setSelectedPersonas] = useState<string[]>([]);
  const [toneGuidance, setToneGuidance] = useState("");

  const profilePersonas = (activeProfile as any)?.personas || [];

  const addKeyMessage = () => {
    if (keyMessageInput.trim()) {
      setKeyMessages([...keyMessages, keyMessageInput.trim()]);
      setKeyMessageInput("");
    }
  };

  const removeKeyMessage = (index: number) => {
    setKeyMessages(keyMessages.filter((_, i) => i !== index));
  };

  const togglePersona = (p: string) => {
    setSelectedPersonas((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({
      title: title.trim(),
      objective: objective.trim() || undefined,
      key_messages: keyMessages.length > 0 ? keyMessages : undefined,
      target_personas: selectedPersonas.length > 0 ? selectedPersonas : undefined,
      tone_guidance: toneGuidance.trim() || undefined,
      linked_story_ids: availableStoryIds.length > 0 ? availableStoryIds : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="border rounded-lg p-4 bg-card space-y-3">
      <div>
        <label className="block text-sm font-medium mb-1">Brief Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="LinkedIn campaign for Q1 launch"
          className="w-full text-sm border rounded-md px-3 py-1.5 bg-background"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Objective</label>
        <textarea
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="What should this content achieve?"
          rows={2}
          className="w-full text-sm border rounded-md px-3 py-1.5 bg-background resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Key Messages</label>
        <div className="flex gap-2 mb-1">
          <input
            type="text"
            value={keyMessageInput}
            onChange={(e) => setKeyMessageInput(e.target.value)}
            placeholder="Add a key message..."
            className="flex-1 text-sm border rounded-md px-3 py-1.5 bg-background"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addKeyMessage();
              }
            }}
          />
          <button
            type="button"
            onClick={addKeyMessage}
            className="px-3 py-1.5 text-sm border rounded-md hover:bg-accent"
          >
            Add
          </button>
        </div>
        {keyMessages.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {keyMessages.map((m, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-muted rounded"
              >
                {m}
                <button type="button" onClick={() => removeKeyMessage(i)}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {profilePersonas.length > 0 && (
        <div>
          <label className="block text-sm font-medium mb-1">Target Personas</label>
          <div className="flex flex-wrap gap-1.5">
            {profilePersonas.map((p: string) => (
              <button
                key={p}
                type="button"
                onClick={() => togglePersona(p)}
                className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                  selectedPersonas.includes(p)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-accent"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Tone Guidance</label>
        <input
          type="text"
          value={toneGuidance}
          onChange={(e) => setToneGuidance(e.target.value)}
          placeholder="Professional but conversational"
          className="w-full text-sm border rounded-md px-3 py-1.5 bg-background"
        />
      </div>

      {onPickStories && (
        <div>
          <button
            type="button"
            onClick={onPickStories}
            className="text-sm text-primary hover:underline"
          >
            Pick stories to link ({availableStoryIds.length} selected)
          </button>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={isLoading || !title.trim()}
          className="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-50"
        >
          {isLoading ? "Creating..." : "Create Brief"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-1.5 text-sm border rounded-md"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
