import { useState, useEffect, useMemo, useCallback } from "react";
import { useOrg } from "@/contexts/OrgContext";
import { useTeamHierarchy } from "@/hooks/revops/useTeamHierarchy";

interface ScopeFilterProps {
  onOwnerIdsChange?: (ids: string[] | null) => void;
  /** Alias used by Dashboard */
  onUpdateOwnerIds?: (ids: string[] | null) => void;
}

export function ScopeFilter({
  onOwnerIdsChange,
  onUpdateOwnerIds,
}: ScopeFilterProps) {
  const emitChange = onOwnerIdsChange ?? onUpdateOwnerIds ?? (() => {});
  const { hasRole } = useOrg();
  const {
    scope,
    setScope,
    filterOwnerIds,
    hasDirectReports,
    teamSubtreeIds,
    getDirectReports,
  } = useTeamHierarchy();

  const [selectedMemberId, setSelectedMemberId] = useState("");

  const directReports = useMemo(() => {
    if (teamSubtreeIds.length > 0) {
      const currentUserId = teamSubtreeIds[0];
      return getDirectReports(currentUserId);
    }
    return [];
  }, [teamSubtreeIds, getDirectReports]);

  const emitOwnerIds = useCallback(() => {
    if (selectedMemberId) {
      emitChange([selectedMemberId]);
    } else {
      emitChange(filterOwnerIds);
    }
  }, [selectedMemberId, filterOwnerIds, emitChange]);

  // Emit on mount
  useEffect(() => {
    emitOwnerIds();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When filterOwnerIds changes and no specific member selected, re-emit
  useEffect(() => {
    if (!selectedMemberId) {
      emitChange(filterOwnerIds);
    }
  }, [filterOwnerIds]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleScopeChange(newScope: "mine" | "team" | "all") {
    setScope(newScope);
    setSelectedMemberId("");
    if (newScope === "all") {
      emitChange(null);
    } else if (newScope === "team") {
      emitChange(teamSubtreeIds.length > 0 ? teamSubtreeIds : null);
    } else {
      emitChange(
        teamSubtreeIds.length > 0 ? [teamSubtreeIds[0]] : null,
      );
    }
  }

  function handleMemberChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const memberId = e.target.value;
    setSelectedMemberId(memberId);
    if (memberId) {
      emitChange([memberId]);
    } else {
      emitChange(filterOwnerIds);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium text-gray-600">Scope:</span>
      <div className="inline-flex rounded-lg border border-gray-300 bg-white overflow-hidden">
        <button
          onClick={() => handleScopeChange("mine")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            scope === "mine"
              ? "bg-blue-600 text-white"
              : "text-gray-700 hover:bg-gray-50"
          }`}
        >
          My Deals
        </button>
        {hasDirectReports && (
          <button
            onClick={() => handleScopeChange("team")}
            className={`px-4 py-2 text-sm font-medium border-l border-gray-300 transition-colors ${
              scope === "team"
                ? "bg-blue-600 text-white"
                : "text-gray-700 hover:bg-gray-50"
            }`}
          >
            My Team
          </button>
        )}
        {hasRole("admin") && (
          <button
            onClick={() => handleScopeChange("all")}
            className={`px-4 py-2 text-sm font-medium border-l border-gray-300 transition-colors ${
              scope === "all"
                ? "bg-blue-600 text-white"
                : "text-gray-700 hover:bg-gray-50"
            }`}
          >
            All
          </button>
        )}
      </div>

      {scope === "team" && directReports.length > 0 && (
        <select
          value={selectedMemberId}
          onChange={handleMemberChange}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="">All Team Members</option>
          {directReports.map((member: any) => (
            <option key={member.user_id} value={member.user_id}>
              {member.display_name ||
                member.email ||
                member.user_id.slice(0, 8)}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
