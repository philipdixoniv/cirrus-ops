import { useState, useEffect, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { useOrders } from "@/hooks/revops/useOrders";

function statusClass(status: string): string {
  const classes: Record<string, string> = {
    pending: "bg-gray-100 text-gray-800",
    active: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
    expired: "bg-amber-100 text-amber-800",
  };
  return classes[status] || classes.pending;
}

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { getOrder, updateOrderStatus } = useOrders();
  const [order, setOrder] = useState<any>(null);
  const [loadingOrder, setLoadingOrder] = useState(true);

  const fetchOrder = useCallback(async () => {
    if (!id) return;
    try {
      const data = await getOrder(id);
      setOrder(data);
    } finally {
      setLoadingOrder(false);
    }
  }, [id, getOrder]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  const handleStatusChange = useCallback(
    async (status: string) => {
      if (!id) return;
      await updateOrderStatus(id, status);
      const data = await getOrder(id);
      setOrder(data);
    },
    [id, updateOrderStatus, getOrder],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/orders" className="text-gray-500 hover:text-gray-700 text-sm">
            &larr; Back
          </Link>
          <h2 className="text-2xl font-bold text-gray-900">
            {order?.order_number || "Order"}
          </h2>
        </div>
        {order && (
          <div className="flex gap-2">
            {order.status === "pending" && (
              <button
                onClick={() => handleStatusChange("active")}
                className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-1.5 px-4 rounded-lg"
              >
                Activate
              </button>
            )}
            {order.status === "active" && (
              <button
                onClick={() => handleStatusChange("cancelled")}
                className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-1.5 px-4 rounded-lg"
              >
                Cancel
              </button>
            )}
          </div>
        )}
      </div>

      {loadingOrder ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
      ) : order ? (
        <>
          {/* Info Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="grid grid-cols-2 gap-x-12 gap-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Account</span>
                <span className="text-sm font-medium text-gray-900">
                  {order.accounts?.name || "N/A"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Status</span>
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusClass(order.status)}`}>
                  {order.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Opportunity</span>
                {order.opportunities ? (
                  <Link
                    to={`/opportunity/${order.opportunities.id}`}
                    className="text-sm font-medium text-blue-600 hover:text-blue-800"
                  >
                    {order.opportunities.name}
                  </Link>
                ) : (
                  <span className="text-sm text-gray-500">N/A</span>
                )}
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Start Date</span>
                <span className="text-sm font-medium text-gray-900">
                  {order.start_date || "N/A"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">MRR</span>
                <span className="text-sm font-medium text-gray-900">
                  ${Number(order.mrr).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">ARR</span>
                <span className="text-sm font-medium text-gray-900">
                  ${Number(order.arr).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">TCV</span>
                <span className="text-sm font-bold text-gray-900">
                  ${Number(order.tcv).toLocaleString()}
                </span>
              </div>
              {order.stripe_subscription_id && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Stripe Sub</span>
                  <span className="text-sm font-mono text-gray-500">
                    {order.stripe_subscription_id}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Line Items */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Line Items</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 font-medium text-gray-500">Product</th>
                  <th className="text-right py-2 font-medium text-gray-500">Qty</th>
                  <th className="text-right py-2 font-medium text-gray-500">Unit Price</th>
                  <th className="text-right py-2 font-medium text-gray-500">Total</th>
                </tr>
              </thead>
              <tbody>
                {(order.order_line_items || []).map((li: any) => (
                  <tr key={li.id} className="border-b border-gray-100">
                    <td className="py-2 text-gray-900">{li.product_name}</td>
                    <td className="py-2 text-right text-gray-700">{li.quantity}</td>
                    <td className="py-2 text-right text-gray-700">
                      ${Number(li.unit_price).toFixed(2)}
                    </td>
                    <td className="py-2 text-right font-medium text-gray-900">
                      ${Number(li.line_total).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
