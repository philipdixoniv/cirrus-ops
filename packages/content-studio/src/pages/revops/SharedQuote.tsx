import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";

export default function SharedQuote() {
  const { token } = useParams<{ token: string }>();

  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function fetchQuote() {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const response = await fetch(
          `${supabaseUrl}/functions/v1/shared-quote?token=${token}`,
        );
        const result = await response.json();

        if (!response.ok) throw new Error(result.error || "Quote not found");
        if (!cancelled) setQuote(result);
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchQuote();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold text-gray-900">Quote</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            Loading...
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        ) : quote ? (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 pt-6 pb-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {quote.opportunity?.accounts?.name || "Quote"}
              </h2>
              <p className="text-sm text-gray-500">
                Prepared for:{" "}
                {[
                  quote.opportunity?.contacts?.first_name,
                  quote.opportunity?.contacts?.last_name,
                ]
                  .filter(Boolean)
                  .join(" ")}
              </p>
            </div>

            <div className="px-6 py-4 border-b border-gray-200">
              <div className="grid grid-cols-2 gap-x-12 gap-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Term</span>
                  <span className="text-sm font-medium text-gray-900">
                    {quote.term_length?.replace("_", " ")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Billing</span>
                  <span className="text-sm font-medium text-gray-900 capitalize">
                    {quote.billing_frequency}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Status</span>
                  <span className="text-sm font-medium text-gray-900 capitalize">
                    {quote.status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Version</span>
                  <span className="text-sm font-medium text-gray-900">
                    v{quote.version_number}
                  </span>
                </div>
              </div>
            </div>

            {/* Line Items */}
            <div className="px-6 py-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 font-medium text-gray-500">
                      Item
                    </th>
                    <th className="text-right py-2 font-medium text-gray-500">
                      Qty
                    </th>
                    <th className="text-right py-2 font-medium text-gray-500">
                      Unit Price
                    </th>
                    <th className="text-right py-2 font-medium text-gray-500">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(quote.quote_line_items || []).map((li: any) => (
                    <tr
                      key={li.id}
                      className="border-b border-gray-100"
                    >
                      <td className="py-2 text-gray-900">
                        {li.feature_name}
                      </td>
                      <td className="py-2 text-right text-gray-700">
                        {li.quantity}
                      </td>
                      <td className="py-2 text-right text-gray-700">
                        ${Number(li.unit_price).toFixed(2)}
                      </td>
                      <td className="py-2 text-right font-medium text-gray-900">
                        ${Number(li.line_total).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {(quote.quote_services || []).map((svc: any) => (
                    <tr
                      key={svc.id}
                      className="border-b border-gray-100"
                    >
                      <td className="py-2 text-gray-900">
                        {svc.service_name} ({svc.duration})
                      </td>
                      <td className="py-2 text-right text-gray-700">
                        {svc.quantity}
                      </td>
                      <td className="py-2 text-right text-gray-700">
                        ${Number(svc.price).toFixed(2)}
                      </td>
                      <td className="py-2 text-right font-medium text-gray-900">
                        ${(Number(svc.price) * svc.quantity).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-900">
                    <td
                      colSpan={3}
                      className="py-3 text-right font-bold text-gray-900"
                    >
                      MRR
                    </td>
                    <td className="py-3 text-right font-bold text-gray-900">
                      ${Number(quote.mrr).toLocaleString()}
                    </td>
                  </tr>
                  <tr>
                    <td
                      colSpan={3}
                      className="py-1 text-right font-medium text-gray-700"
                    >
                      ARR
                    </td>
                    <td className="py-1 text-right font-medium text-gray-700">
                      ${Number(quote.arr).toLocaleString()}
                    </td>
                  </tr>
                  <tr>
                    <td
                      colSpan={3}
                      className="py-1 text-right font-bold text-gray-900"
                    >
                      TCV
                    </td>
                    <td className="py-1 text-right font-bold text-lg text-gray-900">
                      ${Number(quote.tcv).toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Payment Link */}
            {quote.stripe_payment_link && (
              <div className="px-6 py-4 border-t border-gray-200">
                <a
                  href={quote.stripe_payment_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-6 rounded-lg text-sm"
                >
                  Proceed to Payment
                </a>
              </div>
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}
