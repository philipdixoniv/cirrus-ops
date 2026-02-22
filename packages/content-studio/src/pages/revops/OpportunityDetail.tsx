import { useState, useMemo, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useOpportunities } from "@/hooks/revops/useOpportunities";
import { useQuotes } from "@/hooks/revops/useQuotes";
import { RECORD_TYPES } from "@/lib/recordTypes";
import { QuoteActions } from "@/components/revops/QuoteActions";

function statusClass(status: string): string {
  const classes: Record<string, string> = {
    draft: "bg-gray-100 text-gray-800",
    sent: "bg-blue-100 text-blue-800",
    accepted: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
  };
  return classes[status] || classes.draft;
}

function paymentStatusClass(status: string): string {
  const classes: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800",
    paid: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
  };
  return classes[status] || "bg-gray-100 text-gray-800";
}

function formatCurrency(val: number | null | undefined): string {
  return val ? `$${Number(val).toLocaleString()}` : "$0";
}

function formatDate(date: string | null | undefined): string {
  return date ? new Date(date).toLocaleDateString() : "";
}

export default function OpportunityDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getOpportunity, updateOpportunityStage } = useOpportunities();
  const { promoteQuote } = useQuotes();

  const [opportunity, setOpportunity] = useState<any>(null);
  const [loadingOpp, setLoadingOpp] = useState(true);

  const primaryQuote = useMemo(
    () => opportunity?.quotes?.find((q: any) => q.is_primary) || null,
    [opportunity],
  );

  const loadOpportunity = useCallback(async () => {
    if (!id) return;
    try {
      const data = await getOpportunity(id);
      setOpportunity(data);
    } finally {
      setLoadingOpp(false);
    }
  }, [id, getOpportunity]);

  useEffect(() => {
    loadOpportunity();
  }, [loadOpportunity]);

  async function handlePromote(quoteId: string) {
    await promoteQuote(quoteId);
    if (id) {
      const data = await getOpportunity(id);
      setOpportunity(data);
    }
  }

  async function handleStageChange(newStage: string) {
    if (!id) return;
    await updateOpportunityStage(id, newStage);
    setOpportunity((prev: any) => ({ ...prev, stage: newStage }));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">
          {opportunity?.name || "Opportunity"}
        </h2>
        <button
          onClick={() => navigate(`/opportunity/${id}/quote/new`)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
        >
          + New Quote
        </button>
      </div>

      {loadingOpp ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          Loading...
        </div>
      ) : opportunity ? (
        <>
          {/* Info Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="grid grid-cols-2 gap-x-12 gap-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Account</span>
                <span className="text-sm font-medium text-gray-900">
                  {opportunity.accounts?.name || "N/A"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Stage</span>
                <select
                  value={opportunity.stage}
                  onChange={(e) => handleStageChange(e.target.value)}
                  className="text-sm text-right border-0 bg-transparent font-medium text-gray-900 cursor-pointer focus:ring-0 pr-6"
                >
                  <option value="prospecting">Prospecting</option>
                  <option value="qualification">Qualification</option>
                  <option value="proposal">Proposal</option>
                  <option value="negotiation">Negotiation</option>
                  <option value="closed_won">Closed Won</option>
                  <option value="closed_lost">Closed Lost</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Contact</span>
                <span className="text-sm font-medium text-gray-900">
                  {[
                    opportunity.contacts?.first_name,
                    opportunity.contacts?.last_name,
                  ]
                    .filter(Boolean)
                    .join(" ") || "N/A"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Amount</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatCurrency(opportunity.amount)}
                </span>
              </div>
              {opportunity.contacts?.email && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Email</span>
                  <span className="text-sm font-medium text-gray-900">
                    {opportunity.contacts.email}
                  </span>
                </div>
              )}
              {opportunity.contacts?.title && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Title</span>
                  <span className="text-sm font-medium text-gray-900">
                    {opportunity.contacts.title}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Quotes Table */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Quotes
            </h2>

            {!opportunity.quotes || opportunity.quotes.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                <p>No quotes yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Version
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Payment
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        MRR
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        ARR
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        TCV
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Updated
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {opportunity.quotes.map((quote: any) => (
                      <tr key={quote.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                          v{quote.version_number}
                          {quote.is_primary && (
                            <span className="ml-1 px-1.5 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-800">
                              Primary
                            </span>
                          )}
                          {quote.record_type && (
                            <span
                              className={`ml-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full ${
                                quote.record_type === "new_customer"
                                  ? "bg-blue-50 text-blue-700"
                                  : quote.record_type === "upsell"
                                    ? "bg-green-50 text-green-700"
                                    : quote.record_type === "renewal"
                                      ? "bg-purple-50 text-purple-700"
                                      : ""
                              }`}
                            >
                              {RECORD_TYPES[quote.record_type]?.label}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-1 text-xs font-medium rounded-full ${statusClass(quote.status)}`}
                          >
                            {quote.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {quote.payment_status &&
                            quote.payment_status !== "unpaid" && (
                              <span
                                className={`px-2 py-1 text-xs font-medium rounded-full ${paymentStatusClass(quote.payment_status)}`}
                              >
                                {quote.payment_status}
                              </span>
                            )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                          {formatCurrency(quote.mrr)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                          {formatCurrency(quote.arr)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                          {formatCurrency(quote.tcv)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-500">
                          {formatDate(
                            quote.updated_at || quote.created_at,
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm space-x-2">
                          <button
                            onClick={() =>
                              navigate(`/quote/${quote.id}/edit`)
                            }
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Edit
                          </button>
                          {!quote.is_primary && (
                            <button
                              onClick={() => handlePromote(quote.id)}
                              className="text-gray-500 hover:text-gray-700 font-medium"
                            >
                              Promote
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Quote Actions for primary quote */}
            {primaryQuote && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-500 mb-2">
                  Primary Quote Actions (v{primaryQuote.version_number})
                </p>
                <QuoteActions
                  quoteId={primaryQuote.id}
                  showPaymentLink={primaryQuote.status === "accepted"}
                />
              </div>
            )}
          </div>

          {/* Activity Timeline placeholder */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Activity Timeline
            </h2>
            <p className="text-sm text-gray-500">
              Activity timeline for this opportunity.
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}
