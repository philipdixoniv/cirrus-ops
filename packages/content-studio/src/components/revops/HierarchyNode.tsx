import { useMemo } from "react";

interface Member {
  id: string;
  user_id: string;
  display_name?: string;
  email?: string;
  role: string;
  reports_to?: string | null;
}

interface HierarchyNodeProps {
  member: Member;
  allMembers: Member[];
  depth?: number;
  isAdmin?: boolean;
  availableManagers?: Member[];
  onUpdateReportsTo: (memberId: string, reportsTo: string | null) => void;
}

const roleBadgeClass: Record<string, string> = {
  owner: "bg-purple-100 text-purple-800",
  admin: "bg-blue-100 text-blue-800",
  manager: "bg-green-100 text-green-800",
  member: "bg-gray-100 text-gray-800",
};

export function HierarchyNode({
  member,
  allMembers,
  depth = 0,
  isAdmin = false,
  availableManagers = [],
  onUpdateReportsTo,
}: HierarchyNodeProps) {
  const directReports = useMemo(
    () => allMembers.filter((m) => m.reports_to === member.user_id),
    [allMembers, member.user_id],
  );

  return (
    <div style={{ paddingLeft: `${depth * 24}px` }}>
      <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-gray-50 group">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {member.display_name || member.user_id.slice(0, 8) + "..."}
          </p>
          {member.email && (
            <p className="text-xs text-gray-500 truncate">{member.email}</p>
          )}
        </div>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
            roleBadgeClass[member.role] || roleBadgeClass.member
          }`}
        >
          {member.role}
        </span>
        {isAdmin && member.role !== "owner" && (
          <select
            value={member.reports_to || ""}
            onChange={(e) => onUpdateReportsTo(member.id, e.target.value || null)}
            className="text-xs border border-gray-200 rounded px-2 py-1 bg-white opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <option value="">No manager</option>
            {availableManagers.map((mgr) => (
              <option key={mgr.user_id} value={mgr.user_id}>
                {mgr.display_name || mgr.user_id.slice(0, 8)}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Recursive children */}
      {directReports.map((child) => (
        <HierarchyNode
          key={child.id}
          member={child}
          allMembers={allMembers}
          depth={depth + 1}
          isAdmin={isAdmin}
          availableManagers={availableManagers}
          onUpdateReportsTo={onUpdateReportsTo}
        />
      ))}
    </div>
  );
}
