import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Receipt } from "lucide-react";
import { useSalesQuotes } from "@/hooks/useSales";
import { StatusBadge } from "@/components/StatusBadge";
import { Pagination } from "@/components/Pagination";
import { CardSkeleton } from "@/components/ui/CardSkeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency, formatDate } from "@/lib/utils";

export function SalesQuotes() {
  const [statusFilter, setStatusFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const { data, isLoading } = useSalesQuotes({
    status: statusFilter || undefined,
    limit,
    offset,
  });

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sales Quotes</h1>
          <p className="text-muted-foreground">
            Create and manage pricing proposals
          </p>
        </div>
        <Link
          to="/sales/quotes/new"
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          New Quote
        </Link>
      </div>

      <div className="flex gap-3">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setOffset(0);
          }}
          className="text-sm border rounded-md px-3 py-1.5 bg-background"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
          <option value="expired">Expired</option>
        </select>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}

      {data && data.items.length === 0 && (
        <EmptyState
          icon={Receipt}
          title="No quotes yet"
          description="Create your first sales quote to start building proposals."
          action={{ label: "New Quote", onClick: () => {} }}
        />
      )}

      {data && data.items.length > 0 && (
        <>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Customer</th>
                  <th className="text-left px-4 py-2 font-medium">Company</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-right px-4 py-2 font-medium">Total</th>
                  <th className="text-left px-4 py-2 font-medium">Valid Until</th>
                  <th className="text-left px-4 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.items.map((quote) => (
                  <tr key={quote.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        to={`/sales/quotes/${quote.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {quote.customer_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {quote.customer_company || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={quote.status} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatCurrency(quote.total, true)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(quote.valid_until)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(quote.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            total={data.total}
            limit={limit}
            offset={offset}
            onPageChange={setOffset}
          />
        </>
      )}
    </div>
  );
}
