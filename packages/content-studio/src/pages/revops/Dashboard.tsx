import { useState, useMemo, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTeamHierarchy } from "@/hooks/revops/useTeamHierarchy";
import { useEngagement } from "@/hooks/revops/useEngagement";
import { useOpportunities } from "@/hooks/revops/useOpportunities";
import { useQuotes } from "@/hooks/revops/useQuotes";
import { ScopeFilter } from "@/components/revops/ScopeFilter";

/* ---------- helpers ---------- */

function formatCurrency(val: number | null | undefined): string {
  return val ? `$${Number(val).toLocaleString()}` : "$0";
}

function formatDate(date: string | null | undefined): string {
  return date ? new Date(date).toLocaleDateString() : "";
}

function formatStage(stage: string | null | undefined): string {
  return (stage || "").replace(/_/g, " ");
}

function stageClass(stage: string | null | undefined): string {
  const classes: Record<string, string> = {
    prospecting: "bg-gray-100 text-gray-800",
    qualification: "bg-blue-100 text-blue-800",
    proposal: "bg-indigo-100 text-indigo-800",
    negotiation: "bg-amber-100 text-amber-800",
    closed_won: "bg-green-100 text-green-800",
    closed_lost: "bg-red-100 text-red-800",
  };
  return classes[stage || ""] || classes.prospecting;
}

function statusClass(status: string | null | undefined): string {
  const classes: Record<string, string> = {
    draft: "bg-gray-100 text-gray-800",
    sent: "bg-blue-100 text-blue-800",
    accepted: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
  };
  return classes[status || ""] || classes.draft;
}

const ENGAGEMENT_RANGE_OPTIONS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

/* ---------- Dashboard ---------- */

export default function Dashboard() {
  const navigate = useNavigate();
  const { getOpportunities } = useOpportunities();
  const { getQuotes } = useQuotes();
  const {
    scope,
    filterOwnerIds,
    hasDirectReports,
    teamSubtreeIds,
    getOwnerName,
  } = useTeamHierarchy();

  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [engagementDays, setEngagementDays] = useState(30);
  const [currentOwnerIds, setCurrentOwnerIds] = useState<string[] | null>(null);

  // Derive the user ids to pass to the engagement hook
  const engagementUserIds = useMemo(() => {
    return currentOwnerIds || teamSubtreeIds;
  }, [currentOwnerIds, teamSubtreeIds]);

  const { engagementData, totals: engagementTotals } = useEngagement(
    engagementUserIds?.length ? engagementUserIds : undefined,
    engagementDays,
  );

  const totalPipelineValue = useMemo(
    () => opportunities.reduce((sum, o) => sum + Number(o.amount || 0), 0),
    [opportunities],
  );

  const loadData = useCallback(
    async (ownerIds: string[] | null) => {
      const filter = ownerIds ? { ownerIds } : {};
      const [opps, recentQuotes] = await Promise.all([
        getOpportunities(filter),
        getQuotes(filter),
      ]);
      setOpportunities(opps);
      setQuotes(recentQuotes);
    },
    [getOpportunities, getQuotes],
  );

  const handleOwnerIdsChange = useCallback(
    async (ownerIds: string[] | null) => {
      setCurrentOwnerIds(ownerIds);
      await loadData(ownerIds);
    },
    [loadData],
  );

  // Reload data when engagementDays changes (engagement is handled by React Query via the hook)
  // Initial load triggered by ScopeFilter emitting owner ids on mount

  return (
    <div className="space-y-8">
      <ScopeFilter onOwnerIdsChange={handleOwnerIdsChange} />

      {/* Manager Summary Cards */}
      {hasDirectReports && scope !== "mine" && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500">Open Opportunities</p>
              <p className="text-2xl font-bold text-gray-900">
                {opportunities.length}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500">Total Pipeline</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(totalPipelineValue)}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500">Recent Quotes</p>
              <p className="text-2xl font-bold text-gray-900">
                {quotes.length}
              </p>
            </div>
            <Link
              to="/pipeline"
              className="bg-blue-50 rounded-lg shadow p-4 hover:bg-blue-100 transition-colors block"
            >
              <p className="text-sm text-blue-600 font-medium">
                Pipeline Dashboard
              </p>
              <p className="text-sm text-blue-500 mt-1">
                View accounts, stale quotes &amp; waterfall &rarr;
              </p>
            </Link>
          </div>
        </div>
      )}

      {/* Engagement Summary */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-800">Engagement</h2>
          <div className="inline-flex rounded-lg border border-gray-300 bg-white overflow-hidden">
            {ENGAGEMENT_RANGE_OPTIONS.map((option, idx) => (
              <button
                key={option.days}
                onClick={() => setEngagementDays(option.days)}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  engagementDays === option.days
                    ? "bg-blue-600 text-white"
                    : "text-gray-700 hover:bg-gray-50"
                } ${idx !== 0 ? "border-l border-gray-300" : ""}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-6 gap-4">
          {(
            [
              ["Meetings", engagementTotals.meetings],
              ["Calls", engagementTotals.calls],
              ["Emails", engagementTotals.emails],
              ["Tasks", engagementTotals.tasks],
              ["Docs Shared", engagementTotals.documents_shared],
              ["Link Views", engagementTotals.share_link_views],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500">{label}</p>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
            </div>
          ))}
        </div>

        {/* Per-user breakdown (visible in team/all scope) */}
        {scope !== "mine" && engagementData.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-base font-semibold text-gray-800 mb-3">
              Per-User Breakdown
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      User
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Meetings
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Calls
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Emails
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Tasks
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Docs
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Views
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {engagementData.map((entry: any) => (
                    <tr key={entry.user_id}>
                      <td className="px-4 py-2 text-sm text-gray-900">
                        {getOwnerName(entry.user_id)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-900">
                        {entry.meetings}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-900">
                        {entry.calls}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-900">
                        {entry.emails}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-900">
                        {entry.tasks}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-900">
                        {entry.documents_shared}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-900">
                        {entry.share_link_views}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Opportunities */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">
          Opportunities
        </h2>

        {opportunities.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            <p>No opportunities yet. Create a quote to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Account
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Opportunity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stage
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Owner
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Updated
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {opportunities.map((opp: any) => (
                  <tr
                    key={opp.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`/opportunity/${opp.id}`)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {opp.accounts?.name || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {opp.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(opp.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${stageClass(opp.stage)}`}
                      >
                        {formatStage(opp.stage)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {getOwnerName(opp.owner_id)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(opp.updated_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Quotes */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">
          Recent Quotes
        </h2>

        {quotes.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            <p>No quotes yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Account
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Opportunity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Version
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    MRR
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    TCV
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Owner
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {quotes.map((quote: any) => (
                  <tr
                    key={quote.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`/quote/${quote.id}/edit`)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {quote.accountName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {quote.opportunityName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      v{quote.versionNumber}
                      {quote.isPrimary && (
                        <span className="ml-1 px-1.5 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-800">
                          Primary
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${statusClass(quote.status)}`}
                      >
                        {quote.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(quote.mrr)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(quote.tcv)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {getOwnerName(quote.ownerId)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(quote.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
