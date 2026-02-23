import { useParams, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { SalesQuoteForm } from "@/components/SalesQuoteForm";
import { CardSkeleton } from "@/components/ui/CardSkeleton";
import { useSalesQuote, useUpdateSalesQuote } from "@/hooks/useSales";

export function SalesQuoteEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: quote, isLoading } = useSalesQuote(id || "");
  const updateMutation = useUpdateSalesQuote();

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

  if (quote.status !== "draft" && quote.status !== "sent") {
    return (
      <div className="text-muted-foreground">
        This quote cannot be edited in its current status ({quote.status}).
      </div>
    );
  }

  const handleSubmit = (data: Parameters<typeof updateMutation.mutate>[0]["data"]) => {
    updateMutation.mutate(
      { id: quote.id, data },
      {
        onSuccess: () => navigate(`/sales/quotes/${quote.id}`),
      }
    );
  };

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Edit Quote"
        breadcrumbs={[
          { label: "Sales Quotes", href: "/sales/quotes" },
          { label: quote.customer_name, href: `/sales/quotes/${quote.id}` },
          { label: "Edit" },
        ]}
      />

      <SalesQuoteForm
        initialData={{
          customer_name: quote.customer_name,
          customer_company: quote.customer_company || undefined,
          customer_email: quote.customer_email || undefined,
          discount_pct: quote.discount_pct || undefined,
          notes: quote.notes || undefined,
          valid_until: quote.valid_until || undefined,
          items: quote.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            sort_order: item.sort_order,
          })),
        }}
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/sales/quotes/${quote.id}`)}
        isLoading={updateMutation.isPending}
      />
    </div>
  );
}
