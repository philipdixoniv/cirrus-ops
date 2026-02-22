import { useState, useMemo, useEffect, useCallback } from "react";
import { useStripeSync } from "@/hooks/revops/useStripeSync";
import { useStripeInstances } from "@/contexts/StripeInstanceContext";
import { useOrg } from "@/contexts/OrgContext";
import { getSupabase } from "@/lib/supabase";

export default function AdminStripeSync() {
  const {
    syncLog,
    loading,
    error,
    syncProducts,
    promoteToProduction,
    getSyncLog,
    getPriceMap,
  } = useStripeSync();

  const {
    instances: stripeInstances,
    activeInstanceId,
    activeInstance,
    loading: instanceLoading,
    error: instanceError,
    switchInstance,
  } = useStripeInstances();

  const { activeOrgId } = useOrg();

  const [priceMap, setPriceMap] = useState<any[]>([]);
  const [nativeProductsList, setNativeProductsList] = useState<any[]>([]);
  const [nativePricesList, setNativePricesList] = useState<any[]>([]);
  const [nativeCouponsList, setNativeCouponsList] = useState<any[]>([]);
  const [nativeError, setNativeError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<any>(null);

  // Filter sync log by active instance name
  const filteredSyncLog = useMemo(() => {
    if (!activeInstance) return syncLog;
    return syncLog.filter(
      (log: any) => log.environment === activeInstance.name,
    );
  }, [syncLog, activeInstance]);

  const loadPriceMap = useCallback(async () => {
    const data = await getPriceMap();
    setPriceMap(data);
  }, [getPriceMap]);

  const loadNativeData = useCallback(async () => {
    if (!activeOrgId || !activeInstanceId) return;
    setNativeError(null);
    try {
      const supabase = getSupabase();
      const [productsRes, pricesRes, couponsRes] = await Promise.all([
        supabase
          .from("stripe_products")
          .select("*")
          .eq("org_id", activeOrgId)
          .eq("stripe_instance_id", activeInstanceId)
          .order("name"),
        supabase
          .from("stripe_prices")
          .select("*")
          .eq("org_id", activeOrgId)
          .eq("stripe_instance_id", activeInstanceId)
          .order("product_stripe_id"),
        supabase
          .from("stripe_coupons")
          .select("*")
          .eq("org_id", activeOrgId)
          .eq("stripe_instance_id", activeInstanceId)
          .order("created_at", { ascending: false }),
      ]);
      if (productsRes.error) throw productsRes.error;
      if (pricesRes.error) throw pricesRes.error;
      if (couponsRes.error) throw couponsRes.error;
      setNativeProductsList(productsRes.data || []);
      setNativePricesList(pricesRes.data || []);
      setNativeCouponsList(couponsRes.data || []);
    } catch (e: any) {
      setNativeError(e.message);
    }
  }, [activeOrgId, activeInstanceId]);

  // Initial load
  useEffect(() => {
    loadPriceMap();
    loadNativeData();
  }, [loadPriceMap, loadNativeData]);

  // Reload native data when active instance changes
  useEffect(() => {
    loadNativeData();
  }, [activeInstanceId, loadNativeData]);

  function handleInstanceChange(instanceId: string) {
    switchInstance(instanceId);
  }

  async function handleSync() {
    const result = await syncProducts();
    setSyncStatus(result);
    await Promise.all([getSyncLog(), loadPriceMap()]);
  }

  async function handlePromote() {
    // For promote, we need a target instance. Use the first instance that is not the active one.
    const target = stripeInstances.find(
      (i: any) => i.id !== activeInstanceId,
    );
    if (!target) return;
    await promoteToProduction(target.id);
    await Promise.all([getSyncLog(), loadPriceMap()]);
  }

  function formatDate(date: string | null | undefined): string {
    return date ? new Date(date).toLocaleString() : "";
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Stripe Sync Log</h2>

      {(error || nativeError || instanceError) && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          {error || nativeError || instanceError}
        </div>
      )}

      {/* Actions */}
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Sync Actions</h2>
        <div className="flex gap-3">
          <button
            onClick={handleSync}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg text-sm"
          >
            {loading ? "Syncing..." : "Sync Products to Stripe Sandbox"}
          </button>
          <button
            onClick={handlePromote}
            disabled={loading}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg text-sm"
          >
            {loading ? "Promoting..." : "Promote to Production"}
          </button>
        </div>
        {syncStatus && (
          <div className="text-sm text-gray-600">
            Last sync: {JSON.stringify(syncStatus)}
          </div>
        )}
      </div>

      {/* Stripe Native Data */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Stripe Native Data
          </h2>
          <select
            value={activeInstanceId || ""}
            onChange={(e) => handleInstanceChange(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1 text-xs font-medium text-gray-700"
          >
            {stripeInstances.length === 0 && (
              <option value="" disabled>
                No instances
              </option>
            )}
            {stripeInstances.map((inst: any) => (
              <option key={inst.id} value={inst.id}>
                {inst.name}
                {inst.stripe_account_id
                  ? ` (${inst.stripe_account_id})`
                  : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Native Products */}
        <h3 className="text-sm font-medium text-gray-700 mb-2">
          Products ({nativeProductsList.length})
        </h3>
        {nativeProductsList.length === 0 ? (
          <div className="text-sm text-gray-500 mb-4">
            No Stripe-native products imported yet.
          </div>
        ) : (
          <table className="w-full text-sm mb-6">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 font-medium text-gray-500">
                  Name
                </th>
                <th className="text-left py-2 font-medium text-gray-500">
                  Stripe ID
                </th>
                <th className="text-center py-2 font-medium text-gray-500">
                  Active
                </th>
                <th className="text-left py-2 font-medium text-gray-500">
                  Synced
                </th>
              </tr>
            </thead>
            <tbody>
              {nativeProductsList.map((p: any) => (
                <tr key={p.id} className="border-b border-gray-100">
                  <td className="py-2 text-gray-900">{p.name}</td>
                  <td className="py-2 text-gray-500 font-mono text-xs">
                    {p.stripe_id}
                  </td>
                  <td className="py-2 text-center">
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        p.active
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {p.active ? "active" : "inactive"}
                    </span>
                  </td>
                  <td className="py-2 text-gray-500 text-xs">
                    {formatDate(p.synced_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Native Prices */}
        <h3 className="text-sm font-medium text-gray-700 mb-2">
          Prices ({nativePricesList.length})
        </h3>
        {nativePricesList.length === 0 ? (
          <div className="text-sm text-gray-500 mb-4">
            No Stripe-native prices imported yet.
          </div>
        ) : (
          <table className="w-full text-sm mb-6">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 font-medium text-gray-500">
                  Stripe Price ID
                </th>
                <th className="text-left py-2 font-medium text-gray-500">
                  Product
                </th>
                <th className="text-left py-2 font-medium text-gray-500">
                  Type
                </th>
                <th className="text-left py-2 font-medium text-gray-500">
                  Interval
                </th>
                <th className="text-right py-2 font-medium text-gray-500">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {nativePricesList.map((p: any) => (
                <tr key={p.id} className="border-b border-gray-100">
                  <td className="py-2 text-gray-500 font-mono text-xs">
                    {p.stripe_id}
                  </td>
                  <td className="py-2 text-gray-900 font-mono text-xs">
                    {p.product_stripe_id}
                  </td>
                  <td className="py-2 text-gray-700">{p.type}</td>
                  <td className="py-2 text-gray-700">
                    {p.recurring_interval
                      ? `${p.recurring_interval}/${p.recurring_interval_count}`
                      : "-"}
                  </td>
                  <td className="py-2 text-right text-gray-900">
                    {p.unit_amount != null
                      ? `$${(p.unit_amount / 100).toFixed(2)}`
                      : p.billing_scheme === "tiered"
                        ? "tiered"
                        : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Native Coupons */}
        <h3 className="text-sm font-medium text-gray-700 mb-2">
          Coupons ({nativeCouponsList.length})
        </h3>
        {nativeCouponsList.length === 0 ? (
          <div className="text-sm text-gray-500">
            No Stripe-native coupons imported yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 font-medium text-gray-500">
                  Name
                </th>
                <th className="text-left py-2 font-medium text-gray-500">
                  Stripe ID
                </th>
                <th className="text-left py-2 font-medium text-gray-500">
                  Discount
                </th>
                <th className="text-left py-2 font-medium text-gray-500">
                  Duration
                </th>
                <th className="text-center py-2 font-medium text-gray-500">
                  Valid
                </th>
              </tr>
            </thead>
            <tbody>
              {nativeCouponsList.map((c: any) => (
                <tr key={c.id} className="border-b border-gray-100">
                  <td className="py-2 text-gray-900">
                    {c.name || c.stripe_id}
                  </td>
                  <td className="py-2 text-gray-500 font-mono text-xs">
                    {c.stripe_id}
                  </td>
                  <td className="py-2 text-gray-700">
                    {c.percent_off
                      ? `${c.percent_off}%`
                      : c.amount_off
                        ? `$${(c.amount_off / 100).toFixed(2)}`
                        : "-"}
                  </td>
                  <td className="py-2 text-gray-700">
                    {c.duration}
                    {c.duration_in_months
                      ? ` (${c.duration_in_months}mo)`
                      : ""}
                  </td>
                  <td className="py-2 text-center">
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        c.valid
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {c.valid ? "valid" : "expired"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Legacy Price Map */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Legacy Stripe Price Map
        </h2>
        {priceMap.length === 0 ? (
          <div className="text-sm text-gray-500">No prices synced yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 font-medium text-gray-500">
                  Product
                </th>
                <th className="text-left py-2 font-medium text-gray-500">
                  Environment
                </th>
                <th className="text-left py-2 font-medium text-gray-500">
                  Interval
                </th>
                <th className="text-left py-2 font-medium text-gray-500">
                  Stripe Price ID
                </th>
              </tr>
            </thead>
            <tbody>
              {priceMap.map((pm: any, idx: number) => (
                <tr key={pm.id || idx} className="border-b border-gray-100">
                  <td className="py-2 text-gray-900">
                    {pm.products?.name || pm.product_id || "N/A"}
                  </td>
                  <td className="py-2">
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        pm.environment === "production"
                          ? "bg-green-100 text-green-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {pm.environment || pm.type || "sandbox"}
                    </span>
                  </td>
                  <td className="py-2 text-gray-700">
                    {pm.billing_interval}
                  </td>
                  <td className="py-2 text-gray-500 font-mono text-xs">
                    {pm.stripe_price_id || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Sync Log */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Sync Log</h2>
          {activeInstance && (
            <span className="text-xs text-gray-500">
              Filtered by: {activeInstance.name}
            </span>
          )}
        </div>
        {filteredSyncLog.length === 0 ? (
          <div className="text-sm text-gray-500">No sync activity yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 font-medium text-gray-500">
                  Time
                </th>
                <th className="text-left py-2 font-medium text-gray-500">
                  Entity
                </th>
                <th className="text-left py-2 font-medium text-gray-500">
                  Action
                </th>
                <th className="text-left py-2 font-medium text-gray-500">
                  Stripe ID
                </th>
                <th className="text-left py-2 font-medium text-gray-500">
                  Error
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredSyncLog.map((log: any) => (
                <tr key={log.id} className="border-b border-gray-100">
                  <td className="py-2 text-gray-500 text-xs">
                    {formatDate(log.created_at)}
                  </td>
                  <td className="py-2 text-gray-900">
                    {log.entity_type}
                  </td>
                  <td className="py-2 text-gray-700">{log.action}</td>
                  <td className="py-2 text-gray-500 font-mono text-xs">
                    {log.stripe_id || "-"}
                  </td>
                  <td className="py-2 text-red-600 text-xs">
                    {log.error || ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
