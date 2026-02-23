import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { SalesQuoteForm } from "@/components/SalesQuoteForm";
import { useCreateSalesQuote } from "@/hooks/useSales";

export function SalesQuoteCreate() {
  const navigate = useNavigate();
  const createMutation = useCreateSalesQuote();

  const handleSubmit = (data: Parameters<typeof createMutation.mutate>[0]) => {
    createMutation.mutate(data, {
      onSuccess: (quote) => {
        navigate(`/sales/quotes/${quote.id}`);
      },
    });
  };

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="New Sales Quote"
        breadcrumbs={[
          { label: "Sales Quotes", href: "/sales/quotes" },
          { label: "New Quote" },
        ]}
      />

      <SalesQuoteForm
        onSubmit={handleSubmit}
        onCancel={() => navigate("/sales/quotes")}
        isLoading={createMutation.isPending}
      />
    </div>
  );
}
