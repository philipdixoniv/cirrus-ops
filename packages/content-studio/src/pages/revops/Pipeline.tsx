import { useState, useMemo, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { usePipeline } from "@/hooks/revops/usePipeline";
import { ScopeFilter } from "@/components/revops/ScopeFilter";

export default function Pipeline() {
  const navigate = useNavigate();
  const [ownerIds, setOwnerIds] = useState<string[] | null>(null);
  const [sortField, setSortField] = useState("total_pipeline_value");
  const [sortAsc, setSortAsc] = useState(false);

  const { accountPipeline, staleQuotes, waterfall, loading, summaryCards } =
    usePipeline(ownerIds);

  const cards = summaryCards;

  const maxWaterfallTcv = useMemo(
    () => Math.max(1, ...waterfall.map((w: any) => Number(w.total_tcv || 0))),
    [waterfall],
  );

  const sortedPipeline = useMemo(() => {
    const data = [...accountPipeline];
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? 0;
      const vb = b[sortField] ?? 0;
      if (typeof va === "string")
        return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortAsc ? va - vb : vb - va;
    });
    return data;
  }, [accountPipeline, sortField, sortAsc]);

  function handleSortBy(field: string) {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  }

  function handleOwnerIdsChange(ids: string[] | null) {
    setOwnerIds(ids);
  }

  function barWidth(tcv: number) {
    const pct = Math.max(1, (Number(tcv) / maxWaterfallTcv) * 100);
    return `${pct}%`;
  }

  function formatDate(date: string | null | undefined) {
    if (!date) return "-";
    return new Date(date).toLocaleDateString();
  }

  function formatWeek(dateStr: string) {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Pipeline</h2>
      </div>

      <ScopeFilter onOwnerIdsChange={handleOwnerIdsChange} />

      {/* Summary Cards */}
      <div className="grid grid-cols-6 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Total Pipeline</p>
          <p className="text-2xl font-bold text-gray-900">
            ${cards.totalPipeline.toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">New Pipeline (30d)</p>
          <p className="text-2xl font-bold text-gray-900">
            ${cards.newPipeline.toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Stale Quotes</p>
          <p
            className={`text-2xl font-bold ${cards.staleCount > 0 ? "text-amber-600" : "text-gray-900"}`}
          >
            {cards.staleCount}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Avg Deal Age</p>
          <p className="text-2xl font-bold text-gray-900">
            {cards.avgDealAge}d
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Active Accounts</p>
          <p className="text-2xl font-bold text-gray-900">
            {cards.activeAccounts}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Contacts</p>
          <p className="text-2xl font-bold text-gray-900">
            {cards.totalContacts}
          </p>
        </div>
      </div>

      {/* Account Pipeline Table */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Account Pipeline
        </h3>

        {loading ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            Loading...
          </div>
        ) : accountPipeline.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            No open pipeline found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer"
                    onClick={() => handleSortBy("account_name")}
                  >
                    Account
                  </th>
                  <th
                    className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer"
                    onClick={() => handleSortBy("contact_count")}
                  >
                    Contacts
                  </th>
                  <th
                    className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer"
                    onClick={() => handleSortBy("activity_count")}
                  >
                    Activities
                  </th>
                  <th
                    className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer"
                    onClick={() => handleSortBy("open_quote_count")}
                  >
                    Open Quotes
                  </th>
                  <th
                    className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer"
                    onClick={() => handleSortBy("total_pipeline_value")}
                  >
                    Pipeline Value
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Last Activity
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedPipeline.map((row: any) => (
                  <tr
                    key={row.account_id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`/account/${row.account_id}`)}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {row.account_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">
                      {row.contact_count}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">
                      {row.activity_count}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">
                      {row.open_quote_count}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                      ${Number(row.total_pipeline_value).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatDate(
                        row.latest_activity_date || row.latest_quote_date,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Pipeline Waterfall */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          New Pipeline by Week
        </h3>

        {waterfall.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            No pipeline data for the selected period.
          </div>
        ) : (
          <div className="space-y-2">
            {waterfall.map((week: any) => (
              <div
                key={week.week_start}
                className="flex items-center gap-3"
              >
                <span className="w-20 text-xs text-gray-500 flex-shrink-0">
                  {formatWeek(week.week_start)}
                </span>
                <div className="flex-1 flex h-6 rounded overflow-hidden bg-gray-100">
                  {week.draft_count > 0 && (
                    <div
                      className="bg-gray-400 h-full"
                      style={{ width: barWidth(week.total_tcv) }}
                      title={`Draft: ${week.draft_count}`}
                    />
                  )}
                  {week.sent_count > 0 && (
                    <div
                      className="bg-blue-500 h-full"
                      style={{
                        width: barWidth(
                          week.total_tcv * (week.sent_count / week.quote_count),
                        ),
                      }}
                      title={`Sent: ${week.sent_count}`}
                    />
                  )}
                  {week.accepted_count > 0 && (
                    <div
                      className="bg-green-500 h-full"
                      style={{
                        width: barWidth(
                          week.total_tcv *
                            (week.accepted_count / week.quote_count),
                        ),
                      }}
                      title={`Accepted: ${week.accepted_count}`}
                    />
                  )}
                  {week.rejected_count > 0 && (
                    <div
                      className="bg-red-400 h-full"
                      style={{
                        width: barWidth(
                          week.total_tcv *
                            (week.rejected_count / week.quote_count),
                        ),
                      }}
                      title={`Rejected: ${week.rejected_count}`}
                    />
                  )}
                </div>
                <span className="w-24 text-right text-xs font-medium text-gray-700">
                  ${Number(week.total_tcv).toLocaleString()}
                </span>
                <span className="w-16 text-right text-xs text-gray-400">
                  {week.quote_count} quotes
                </span>
              </div>
            ))}
            {/* Legend */}
            <div className="flex gap-4 mt-3 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-gray-400 inline-block" />{" "}
                Draft
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-blue-500 inline-block" />{" "}
                Sent
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-green-500 inline-block" />{" "}
                Accepted
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-red-400 inline-block" />{" "}
                Rejected
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Stale Quotes Table */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Stale Quotes
        </h3>

        {staleQuotes.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            No stale quotes found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Quote
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Account
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Age
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Last Activity
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    TCV
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {staleQuotes.map((sq: any) => (
                  <tr key={sq.quote_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {sq.opportunity_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {sq.account_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          sq.age_days >= 30
                            ? "bg-red-100 text-red-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {sq.age_days}d
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatDate(sq.last_activity_date)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                      ${Number(sq.tcv).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      <Link
                        to={`/quote/${sq.quote_id}/edit`}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Edit
                      </Link>
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
