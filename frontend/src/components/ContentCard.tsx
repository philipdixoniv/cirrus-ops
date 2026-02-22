import { StatusBadge } from "./StatusBadge";
import { PersonaTag } from "./PersonaTag";
import { truncate, formatContentType, formatDate } from "@/lib/utils";
import type { Content } from "@/api/client";

interface ContentCardProps {
  content: Content;
  onClick?: () => void;
}

export function ContentCard({ content, onClick }: ContentCardProps) {
  const approvedCount = content.approval_chain?.filter(
    (s) => s.status === "approved"
  ).length || 0;
  const totalSteps = content.approval_chain?.length || 0;

  return (
    <div
      onClick={onClick}
      className="border rounded-lg p-4 hover:border-primary/50 hover:shadow-sm transition-all bg-card cursor-pointer"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">
          {formatContentType(content.content_type)}
        </span>
        <StatusBadge status={content.status} />
      </div>
      <p className="text-sm text-muted-foreground mb-3">
        {truncate(content.content, 150)}
      </p>

      {content.personas?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {content.personas.map((p) => (
            <PersonaTag key={p} persona={p} />
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {content.tone && <span>Tone: {content.tone}</span>}
        {content.version && content.version > 1 && (
          <span>v{content.version}</span>
        )}
        {totalSteps > 0 && (
          <span>
            Approval: {approvedCount}/{totalSteps}
          </span>
        )}
        <span className="ml-auto">{formatDate(content.created_at)}</span>
      </div>
    </div>
  );
}
