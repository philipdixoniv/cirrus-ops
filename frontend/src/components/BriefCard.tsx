import { StatusBadge } from "./StatusBadge";
import { PersonaTag } from "./PersonaTag";
import type { Brief } from "@/api/client";

interface BriefCardProps {
  brief: Brief;
  onGenerate?: () => void;
  onClick?: () => void;
}

export function BriefCard({ brief, onGenerate, onClick }: BriefCardProps) {
  return (
    <div
      onClick={onClick}
      className="border rounded-lg p-4 hover:border-primary/50 hover:shadow-sm transition-all bg-card cursor-pointer"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="font-semibold text-sm leading-tight">{brief.title}</h3>
        <StatusBadge status={brief.status} />
      </div>

      {brief.objective && (
        <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
          {brief.objective}
        </p>
      )}

      {brief.target_personas.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {brief.target_personas.map((p) => (
            <PersonaTag key={p} persona={p} />
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{brief.linked_story_ids.length} stories linked</span>
        {brief.tone_guidance && <span>Tone: {brief.tone_guidance}</span>}
        <div className="flex-1" />
        {onGenerate && brief.status !== "completed" && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onGenerate();
            }}
            className="text-xs px-2 py-0.5 bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity"
          >
            Generate
          </button>
        )}
      </div>
    </div>
  );
}
