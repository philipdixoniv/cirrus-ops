import { useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { useStripeCompare } from "@/hooks/revops/useStripeCompare";

export default function StripeCompareSync() {
  const {
    instances: stripeInstances,
    sourceInstanceId,
    targetInstanceId,
    setSourceInstanceId,
    setTargetInstanceId,
    comparisonResults,
    loading: compareLoading,
    error: compareError,
    loadComparison,
    pushProducts,
    pushAllMissing,
  } = useStripeCompare();

  const [pushResult, setPushResult] = useState<any>(null);

  const hasResults = useMemo(
    () =>
      comparisonResults != null &&
      ((comparisonResults.matched?.length || 0) > 0 ||
        (comparisonResults.missingInTarget?.length || 0) > 0 ||
        (comparisonResults.missingInSource?.length || 0) > 0),
    [comparisonResults],
  );

  const handleCompare = useCallback(() => {
    if (!sourceInstanceId || !targetInstanceId) return;
    setPushResult(null);
    loadComparison(sourceInstanceId, targetInstanceId);
  }, [sourceInstanceId, targetInstanceId, loadComparison]);

  async function handlePushSingle(stripeId: string) {
    setPushResult(null);
    const result = await pushProducts([stripeId]);
    if (result) setPushResult(result);
  }

  async function handlePushAll() {
    setPushResult(null);
    const result = await pushAllMissing();
    if (result) setPushResult(result);
  }

  function formatDate(date: string | null | undefined): string {
    return date ? new Date(date).toLocaleString() : "";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          to="/admin/products"
          className="text-gray-500 hover:text-gray-700 text-sm"
        >
          &larr; Price Book
        </Link>
        <h2 className="text-2xl font-bold text-gray-900">
          Compare &amp; Sync
        </h2>
      </div>

      {compareError && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          {compareError}
        </div>
      )}

      {/* Instance Selectors */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Source Instance
            </label>
            <select
              value={sourceInstanceId || ""}
              onChange={(e) => {
                setSourceInstanceId(e.target.value || null);
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Select source...
              </option>
              {stripeInstances.map((inst: any) => (
                <option
                  key={inst.id}
                  value={inst.id}
                  disabled={inst.id === targetInstanceId}
                >
                  {inst.name}
                  {inst.stripe_account_id
                    ? ` (${inst.stripe_account_id})`
                    : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Target Instance
            </label>
            <select
              value={targetInstanceId || ""}
              onChange={(e) => {
                setTargetInstanceId(e.target.value || null);
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Select target...
              </option>
              {stripeInstances.map((inst: any) => (
                <option
                  key={inst.id}
                  value={inst.id}
                  disabled={inst.id === sourceInstanceId}
                >
                  {inst.name}
                  {inst.stripe_account_id
                    ? ` (${inst.stripe_account_id})`
                    : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {sourceInstanceId && targetInstanceId && (
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleCompare}
              disabled={compareLoading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg text-sm"
            >
              {compareLoading ? "Loading..." : "Refresh Comparison"}
            </button>
            {comparisonResults &&
              (comparisonResults.missingInTarget?.length || 0) > 0 && (
                <button
                  onClick={handlePushAll}
                  disabled={compareLoading}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg text-sm"
                >
                  {compareLoading
                    ? "Pushing..."
                    : `Push All Missing (${comparisonResults.missingInTarget.length})`}
                </button>
              )}
          </div>
        )}
      </div>

      {/* Push Result */}
      {pushResult && (
        <div className="p-3 bg-green-50 text-green-800 rounded-lg text-sm">
          Pushed {pushResult.pushed_products || pushResult.pushed || 0}{" "}
          product(s), skipped {pushResult.skipped || 0}, errors:{" "}
          {pushResult.errors || 0}
        </div>
      )}

      {/* Comparison Results */}
      {hasResults && comparisonResults ? (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">
                {comparisonResults.matched?.length || 0}
              </div>
              <div className="text-sm text-gray-500">In Both</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <div className="text-2xl font-bold text-amber-600">
                {comparisonResults.missingInTarget?.length || 0}
              </div>
              <div className="text-sm text-gray-500">Source Only</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <div className="text-2xl font-bold text-purple-600">
                {comparisonResults.missingInSource?.length || 0}
              </div>
              <div className="text-sm text-gray-500">Target Only</div>
            </div>
          </div>

          {/* Products in Both */}
          {(comparisonResults.matched?.length || 0) > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                In Both Instances ({comparisonResults.matched.length})
              </h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 font-medium text-gray-500">
                      Product Name
                    </th>
                    <th className="text-left py-2 font-medium text-gray-500">
                      Stripe ID
                    </th>
                    <th className="text-left py-2 font-medium text-gray-500">
                      Match
                    </th>
                    <th className="text-left py-2 font-medium text-gray-500">
                      Differences
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonResults.matched.map((item: any) => (
                    <tr
                      key={item.stripeId}
                      className="border-b border-gray-100"
                    >
                      <td className="py-2 text-gray-900">{item.name}</td>
                      <td className="py-2 text-gray-500 font-mono text-xs">
                        {item.stripeId}
                      </td>
                      <td className="py-2">
                        <span className="bg-blue-100 text-blue-800 px-2 py-0.5 text-xs font-medium rounded-full">
                          Matched
                        </span>
                      </td>
                      <td className="py-2 text-gray-500 text-xs">
                        {item.diffs?.length > 0
                          ? item.diffs.join("; ")
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Source Only */}
          {(comparisonResults.missingInTarget?.length || 0) > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Source Only ({comparisonResults.missingInTarget.length})
                <span className="text-sm font-normal text-gray-500 ml-2">
                  Not yet in target
                </span>
              </h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 font-medium text-gray-500">
                      Product Name
                    </th>
                    <th className="text-left py-2 font-medium text-gray-500">
                      Stripe ID
                    </th>
                    <th className="text-right py-2 font-medium text-gray-500">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonResults.missingInTarget.map((product: any) => (
                    <tr
                      key={product.stripeId}
                      className="border-b border-gray-100"
                    >
                      <td className="py-2 text-gray-900">
                        {product.name}
                      </td>
                      <td className="py-2 text-gray-500 font-mono text-xs">
                        {product.stripeId}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() =>
                            handlePushSingle(product.stripeId)
                          }
                          disabled={compareLoading}
                          className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-1 px-3 rounded text-xs"
                        >
                          Push &rarr;
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Target Only */}
          {(comparisonResults.missingInSource?.length || 0) > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Target Only ({comparisonResults.missingInSource.length})
                <span className="text-sm font-normal text-gray-500 ml-2">
                  Not in source
                </span>
              </h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 font-medium text-gray-500">
                      Product Name
                    </th>
                    <th className="text-left py-2 font-medium text-gray-500">
                      Stripe ID
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonResults.missingInSource.map(
                    (product: any) => (
                      <tr
                        key={product.stripeId}
                        className="border-b border-gray-100"
                      >
                        <td className="py-2 text-gray-900">
                          {product.name}
                        </td>
                        <td className="py-2 text-gray-500 font-mono text-xs">
                          {product.stripeId}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : sourceInstanceId &&
        targetInstanceId &&
        !compareLoading ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500">
            Select two instances and click "Refresh Comparison" to see product
            differences.
          </p>
        </div>
      ) : stripeInstances.length < 2 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500">
            You need at least two Stripe instances to use Compare &amp; Sync.
          </p>
          <Link
            to="/org/settings"
            className="text-blue-600 hover:text-blue-700 text-sm mt-2 inline-block"
          >
            Add instances in Org Settings &rarr;
          </Link>
        </div>
      ) : null}
    </div>
  );
}
