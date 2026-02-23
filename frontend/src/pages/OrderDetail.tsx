import { useParams, Link } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { CardSkeleton } from "@/components/ui/CardSkeleton";
import { useOrder, useUpdateOrder } from "@/hooks/useSales";
import { formatCurrency, formatDate } from "@/lib/utils";

const ORDER_STATUSES = ["pending", "processing", "fulfilled", "cancelled"];

export function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: order, isLoading } = useOrder(id || "");
  const updateMutation = useUpdateOrder();

  if (isLoading) {
    return (
      <div className="max-w-4xl space-y-6">
        <CardSkeleton />
      </div>
    );
  }

  if (!order) {
    return <div className="text-muted-foreground">Order not found.</div>;
  }

  const handleStatusChange = (status: string) => {
    updateMutation.mutate({ id: order.id, data: { status } });
  };

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title=""
        breadcrumbs={[
          { label: "Orders", href: "/sales/orders" },
          { label: order.customer_name },
        ]}
      />

      <div className="border rounded-lg p-6 bg-card space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">{order.customer_name}</h2>
            {order.customer_company && (
              <p className="text-sm text-muted-foreground">{order.customer_company}</p>
            )}
            {order.customer_email && (
              <p className="text-sm text-muted-foreground">{order.customer_email}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <select
              value={order.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={updateMutation.isPending}
              className="text-sm border rounded-md px-2 py-1 bg-background"
            >
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
            <StatusBadge status={order.status} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="border rounded-lg p-4 bg-muted/30">
            <p className="text-xs text-muted-foreground mb-1">Total</p>
            <p className="text-xl font-semibold font-mono">
              {formatCurrency(order.total, true)}
            </p>
          </div>
          <div className="border rounded-lg p-4 bg-muted/30">
            <p className="text-xs text-muted-foreground mb-1">Created</p>
            <p className="text-sm font-medium">{formatDate(order.created_at)}</p>
          </div>
          <div className="border rounded-lg p-4 bg-muted/30">
            <p className="text-xs text-muted-foreground mb-1">Source Quote</p>
            {order.quote_id ? (
              <Link
                to={`/sales/quotes/${order.quote_id}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                View Quote
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground">No linked quote</p>
            )}
          </div>
        </div>

        {order.notes && (
          <div className="text-sm pt-2">
            <span className="font-medium">Notes: </span>
            <span className="text-muted-foreground">{order.notes}</span>
          </div>
        )}
      </div>
    </div>
  );
}
