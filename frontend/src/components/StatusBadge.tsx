import { capitalize } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  // Content statuses
  draft: "bg-yellow-100 text-yellow-800 border-yellow-200",
  reviewed: "bg-blue-100 text-blue-800 border-blue-200",
  published: "bg-green-100 text-green-800 border-green-200",
  ready: "bg-indigo-100 text-indigo-800 border-indigo-200",

  // Campaign statuses
  planning: "bg-slate-100 text-slate-800 border-slate-200",
  active: "bg-emerald-100 text-emerald-800 border-emerald-200",
  completed: "bg-green-100 text-green-800 border-green-200",

  // Approval statuses
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-800 border-red-200",

  // Payment / RevOps statuses
  sent: "bg-blue-100 text-blue-800 border-blue-200",
  accepted: "bg-emerald-100 text-emerald-800 border-emerald-200",
  paid: "bg-green-100 text-green-800 border-green-200",
  failed: "bg-red-100 text-red-800 border-red-200",

  // Pipeline statuses
  closed_won: "bg-green-100 text-green-800 border-green-200",
  closed_lost: "bg-red-100 text-red-800 border-red-200",

  // Order / RevOps statuses
  expired: "bg-gray-100 text-gray-800 border-gray-200",
  processing: "bg-indigo-100 text-indigo-800 border-indigo-200",
  fulfilled: "bg-green-100 text-green-800 border-green-200",
  cancelled: "bg-gray-100 text-gray-800 border-gray-200",
};

interface StatusBadgeProps {
  status: string;
  variant?: "content" | "pipeline" | "payment";
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] || "bg-gray-100 text-gray-800 border-gray-200";
  const label = status.replace(/_/g, " ");

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${style}`}
    >
      {capitalize(label)}
    </span>
  );
}
