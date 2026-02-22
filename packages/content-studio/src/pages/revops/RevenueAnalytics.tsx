import { useState, useMemo } from "react";
import { useRevOpsAnalytics } from "@/hooks/revops/useRevOpsAnalytics";
import { ScopeFilter } from "@/components/revops/ScopeFilter";

interface ChurnMetrics {
  new: number;
  expansion: number;
  contraction: number;
  churn: number;
  reactivation: number;
  netChurnRate: number;
  [key: string]: number;
}

export default function RevenueAnalytics() {
  const [ownerIds, setOwnerIds] = useState<string[] | null>(null);
  const {
    pipelineData,
    loading,
    pipelineSummary,
    mrrOverTime,
    churnMetrics: rawChurnMetrics,
  } = useRevOpsAnalytics(ownerIds);

  const churnMetrics = rawChurnMetrics as ChurnMetrics;

  const totalPipeline = useMemo(
    () => pipelineData.reduce((sum: number, o: any) => sum + Number(o.amount), 0),
    [pipelineData],
  );

  const weightedPipeline = useMemo(
    () => pipelineData.reduce((sum: number, o: any) => sum + (o.weightedAmount || 0), 0),
    [pipelineData],
  );

  const maxAmount = useMemo(() => {
    return Math.max(1, ...Object.values(pipelineSummary).map((s) => s.totalAmount));
  }, [pipelineSummary]);

  const handleOwnerIdsChange = (ids: string[] | null) => {
    setOwnerIds(ids || null);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Analytics</h2>

      <ScopeFilter onOwnerIdsChange={handleOwnerIdsChange} />

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Total Pipeline</p>
          <p className="text-2xl font-bold text-gray-900">${totalPipeline.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Weighted Pipeline</p>
          <p className="text-2xl font-bold text-gray-900">${weightedPipeline.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Active Opportunities</p>
          <p className="text-2xl font-bold text-gray-900">{pipelineData.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Net Churn Rate</p>
          <p className="text-2xl font-bold text-gray-900">
            {(churnMetrics.netChurnRate * 100).toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Pipeline by Stage */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Pipeline by Stage</h2>
        {Object.keys(pipelineSummary).length === 0 ? (
          <div className="text-sm text-gray-500">No pipeline data.</div>
        ) : (
          <div className="space-y-3">
            {Object.entries(pipelineSummary).map(([stage, data]) => (
              <div key={stage} className="flex items-center gap-4">
                <span className="w-28 text-sm text-gray-700 capitalize">
                  {stage.replace("_", " ")}
                </span>
                <div className="flex-1 bg-gray-100 rounded-full h-6 relative">
                  <div
                    className="bg-blue-500 rounded-full h-6"
                    style={{
                      width: maxAmount > 0 ? `${(data.totalAmount / maxAmount) * 100}%` : "0%",
                    }}
                  />
                </div>
                <span className="w-20 text-right text-sm font-medium text-gray-900">
                  {data.count} deals
                </span>
                <span className="w-28 text-right text-sm font-medium text-gray-900">
                  ${data.totalAmount.toLocaleString()}
                </span>
                <span className="w-28 text-right text-sm text-gray-500">
                  ${Math.round(data.weightedAmount).toLocaleString()} wtd
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MRR Over Time */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">MRR Over Time</h2>
        {mrrOverTime.length === 0 ? (
          <div className="text-sm text-gray-500">
            No MRR data yet. MRR snapshots are captured daily from active subscriptions.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 font-medium text-gray-500">Date</th>
                  <th className="text-right py-2 font-medium text-gray-500">MRR</th>
                  <th className="text-right py-2 font-medium text-gray-500">ARR</th>
                </tr>
              </thead>
              <tbody>
                {mrrOverTime.map((snap) => (
                  <tr key={snap.date} className="border-b border-gray-100">
                    <td className="py-2 text-gray-900">{snap.date}</td>
                    <td className="py-2 text-right font-medium text-gray-900">
                      ${snap.mrr.toLocaleString()}
                    </td>
                    <td className="py-2 text-right text-gray-700">
                      ${snap.arr.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Churn Metrics */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Revenue Movements</h2>
        <div className="grid grid-cols-5 gap-4 text-center">
          <div>
            <p className="text-xs text-gray-500">New</p>
            <p className="text-lg font-bold text-green-600">
              ${churnMetrics.new.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Expansion</p>
            <p className="text-lg font-bold text-blue-600">
              ${churnMetrics.expansion.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Contraction</p>
            <p className="text-lg font-bold text-amber-600">
              ${churnMetrics.contraction.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Churn</p>
            <p className="text-lg font-bold text-red-600">
              ${churnMetrics.churn.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Reactivation</p>
            <p className="text-lg font-bold text-purple-600">
              ${churnMetrics.reactivation.toLocaleString()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
