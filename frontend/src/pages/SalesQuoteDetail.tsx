import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Pencil, Trash2, Send, Check, X, ArrowRightLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CardSkeleton } from "@/components/ui/CardSkeleton";
import {
  useSalesQuote,
  useDeleteSalesQuote,
  useSendSalesQuote,
  useAcceptSalesQuote,
  useRejectSalesQuote,
  useConvertQuoteToOrder,
} from "@/hooks/useSales";
import { formatCurrency, formatDate } from "@/lib/utils";

export function SalesQuoteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: quote, isLoading } = useSalesQuote(id || "");

  const deleteMutation = useDeleteSalesQuote();
  const sendMutation = useSendSalesQuote();
  const acceptMutation = useAcceptSalesQuote();
  const rejectMutation = useRejectSalesQuote();
  const convertMutation = useConvertQuoteToOrder();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showConvertConfirm, setShowConvertConfirm] = useState(false);

  if (isLoading) {
    return (
      <div className="max-w-4xl space-y-6">
        <CardSkeleton />
      </div>
    );
  }

  if (!quote) {
    return <div className="text-muted-foreground">Quote not found.</div>;
  }

  const handleDelete = () => {
    deleteMutation.mutate(quote.id, {
      onSuccess: () => navigate("/sales/quotes"),
    });
  };

  const handleSend = () => {
    sendMutation.mutate(quote.id);
  };

  const handleAccept = () => {
    acceptMutation.mutate(quote.id);
  };

  const handleReject = () => {
    rejectMutation.mutate(quote.id);
  };

  const handleConvert = () => {
    convertMutation.mutate(quote.id, {
      onSuccess: (order) => navigate(`/sales/orders/${order.id}`),
    });
  };

  const isPending =
    sendMutation.isPending ||
    acceptMutation.isPending ||
    rejectMutation.isPending ||
    convertMutation.isPending;

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title=""
        breadcrumbs={[
          { label: "Sales Quotes", href: "/sales/quotes" },
          { label: quote.customer_name },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {quote.status === "draft" && (
              <>
                <Link
                  to={`/sales/quotes/${quote.id}/edit`}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md hover:bg-accent transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Link>
                <button
                  onClick={handleSend}
                  disabled={isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" /> Send
                </button>
              </>
            )}
            {quote.status === "sent" && (
              <>
                <Link
                  to={`/sales/quotes/${quote.id}/edit`}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md hover:bg-accent transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Link>
                <button
                  onClick={handleAccept}
                  disabled={isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" /> Accept
                </button>
                <button
                  onClick={handleReject}
                  disabled={isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" /> Reject
                </button>
              </>
            )}
            {quote.status === "accepted" && (
              <button
                onClick={() => setShowConvertConfirm(true)}
                disabled={isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" /> Convert to Order
              </button>
            )}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-1.5 text-muted-foreground hover:text-red-600 transition-colors"
              title="Delete quote"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        }
      />

      {/* Quote details */}
      <div className="border rounded-lg p-6 bg-card space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">{quote.customer_name}</h2>
            {quote.customer_company && (
              <p className="text-sm text-muted-foreground">{quote.customer_company}</p>
            )}
            {quote.customer_email && (
              <p className="text-sm text-muted-foreground">{quote.customer_email}</p>
            )}
          </div>
          <StatusBadge status={quote.status} />
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {quote.valid_until && <span>Valid until: {formatDate(quote.valid_until)}</span>}
          {quote.created_by && <span>Created by: {quote.created_by}</span>}
          <span>Created: {formatDate(quote.created_at)}</span>
        </div>

        {quote.notes && (
          <div className="text-sm">
            <span className="font-medium">Notes: </span>
            <span className="text-muted-foreground">{quote.notes}</span>
          </div>
        )}
      </div>

      {/* Line items table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-2 font-medium">#</th>
              <th className="text-left px-4 py-2 font-medium">Description</th>
              <th className="text-right px-4 py-2 font-medium">Qty</th>
              <th className="text-right px-4 py-2 font-medium">Unit Price</th>
              <th className="text-right px-4 py-2 font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {quote.items.map((item, i) => (
              <tr key={item.id}>
                <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                <td className="px-4 py-3">{item.description}</td>
                <td className="px-4 py-3 text-right font-mono">{item.quantity}</td>
                <td className="px-4 py-3 text-right font-mono">
                  {formatCurrency(item.unit_price, true)}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {formatCurrency(item.total, true)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t bg-muted/30">
            <tr>
              <td colSpan={4} className="px-4 py-2 text-right text-muted-foreground">
                Subtotal
              </td>
              <td className="px-4 py-2 text-right font-mono">
                {formatCurrency(quote.subtotal, true)}
              </td>
            </tr>
            {(quote.discount_pct ?? 0) > 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-2 text-right text-muted-foreground">
                  Discount ({quote.discount_pct}%)
                </td>
                <td className="px-4 py-2 text-right font-mono text-red-600">
                  -{formatCurrency((quote.subtotal || 0) * ((quote.discount_pct || 0) / 100), true)}
                </td>
              </tr>
            )}
            <tr className="font-semibold">
              <td colSpan={4} className="px-4 py-2 text-right">
                Total
              </td>
              <td className="px-4 py-2 text-right font-mono">
                {formatCurrency(quote.total, true)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
        title="Delete quote"
        description="This will permanently delete this quote and all its line items. This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
      />

      <ConfirmDialog
        open={showConvertConfirm}
        onConfirm={handleConvert}
        onCancel={() => setShowConvertConfirm(false)}
        title="Convert to order"
        description="This will create a new order from this accepted quote."
        confirmLabel="Convert"
      />
    </div>
  );
}
