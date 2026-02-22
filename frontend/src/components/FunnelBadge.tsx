const FUNNEL_STYLES: Record<string, string> = {
  awareness: "bg-indigo-100 text-indigo-800 border-indigo-200",
  consideration: "bg-amber-100 text-amber-800 border-amber-200",
  decision: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

export function FunnelBadge({ stage }: { stage: string }) {
  const style = FUNNEL_STYLES[stage] || "bg-gray-100 text-gray-800 border-gray-200";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${style}`}
    >
      {stage}
    </span>
  );
}
