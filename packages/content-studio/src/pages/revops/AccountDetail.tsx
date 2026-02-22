import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAccounts } from "@/hooks/revops/useAccounts";

function stageClass(stage: string): string {
  const classes: Record<string, string> = {
    prospecting: "bg-gray-100 text-gray-800",
    qualification: "bg-blue-100 text-blue-800",
    proposal: "bg-indigo-100 text-indigo-800",
    negotiation: "bg-amber-100 text-amber-800",
    closed_won: "bg-green-100 text-green-800",
    closed_lost: "bg-red-100 text-red-800",
  };
  return classes[stage] || classes.prospecting;
}

function statusClass(status: string): string {
  const classes: Record<string, string> = {
    draft: "bg-gray-100 text-gray-800",
    sent: "bg-blue-100 text-blue-800",
    accepted: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
  };
  return classes[status] || classes.draft;
}

function formatDate(date: string | null | undefined): string {
  return date ? new Date(date).toLocaleDateString() : "";
}

export default function AccountDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getAccountWithRelations } = useAccounts();

  const [account, setAccount] = useState<any>(null);
  const [loadingAccount, setLoadingAccount] = useState(true);

  const contacts = useMemo(() => account?.contacts || [], [account]);
  const opportunities = useMemo(() => account?.opportunities || [], [account]);

  const totalPipelineValue = useMemo(
    () =>
      opportunities.reduce((sum: number, opp: any) => {
        const oppQuotes = opp.quotes || [];
        const openValue = oppQuotes
          .filter(
            (q: any) => q.status === "draft" || q.status === "sent",
          )
          .reduce((s: number, q: any) => s + Number(q.tcv || 0), 0);
        return sum + openValue;
      }, 0),
    [opportunities],
  );

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoadingAccount(true);
    getAccountWithRelations(id)
      .then((data) => {
        if (!cancelled) setAccount(data);
      })
      .finally(() => {
        if (!cancelled) setLoadingAccount(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, getAccountWithRelations]);

  if (!account) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12 text-gray-400 text-sm">
          {loadingAccount ? "Loading..." : "Account not found."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Account Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {account.name}
            </h2>
            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
              {(account.stripe_customer_id_prod ||
                account.stripe_customer_id_sandbox) && (
                <span>
                  Stripe:{" "}
                  {account.stripe_customer_id_prod ||
                    account.stripe_customer_id_sandbox}
                </span>
              )}
              <span>Created {formatDate(account.created_at)}</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Total Pipeline</p>
            <p className="text-2xl font-bold text-gray-900">
              ${totalPipelineValue.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Contacts */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Contacts ({contacts.length})
        </h3>

        {contacts.length === 0 ? (
          <div className="text-sm text-gray-500">
            No contacts for this account.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Name
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Title
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Email
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {contacts.map((contact: any) => (
                  <tr key={contact.id}>
                    <td className="px-4 py-2 text-sm font-medium text-gray-900">
                      {[contact.first_name, contact.last_name]
                        .filter(Boolean)
                        .join(" ") || "Unknown"}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-700">
                      {contact.title || "-"}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-700">
                      {contact.email || "-"}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-500">
                      {formatDate(contact.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Opportunities & Quotes */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Opportunities ({opportunities.length})
        </h3>

        {opportunities.length === 0 ? (
          <div className="text-sm text-gray-500">
            No opportunities for this account.
          </div>
        ) : (
          <div className="space-y-4">
            {opportunities.map((opp: any) => (
              <div
                key={opp.id}
                className="border border-gray-200 rounded-lg"
              >
                <div
                  className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between rounded-t-lg cursor-pointer"
                  onClick={() => navigate(`/opportunity/${opp.id}`)}
                >
                  <div>
                    <span className="font-medium text-sm text-gray-900">
                      {opp.name}
                    </span>
                    <span
                      className={`ml-2 px-2 py-0.5 text-xs font-medium rounded-full ${stageClass(opp.stage)}`}
                    >
                      {(opp.stage || "").replace(/_/g, " ")}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-gray-900">
                    ${Number(opp.amount || 0).toLocaleString()}
                  </span>
                </div>

                {opp.quotes && opp.quotes.length > 0 && (
                  <div className="p-3">
                    <div className="space-y-1">
                      {opp.quotes.map((quote: any) => (
                        <div
                          key={quote.id}
                          className="flex items-center justify-between py-1.5 px-3 rounded text-sm hover:bg-gray-50 cursor-pointer"
                          onClick={() =>
                            navigate(`/quote/${quote.id}/edit`)
                          }
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusClass(quote.status)}`}
                            >
                              {quote.status}
                            </span>
                            <span className="text-gray-700">
                              v{quote.version_number}
                            </span>
                            {quote.is_primary && (
                              <span className="text-xs text-blue-600 font-medium">
                                Primary
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-gray-700">
                            <span>
                              MRR $
                              {Number(quote.mrr || 0).toLocaleString()}
                            </span>
                            <span className="font-medium">
                              TCV $
                              {Number(quote.tcv || 0).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
