import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { useStripeInstances } from "@/contexts/StripeInstanceContext";
import { useStripePricebook } from "@/hooks/revops/useStripePricebook";
import { useQuoteTemplates } from "@/hooks/revops/useQuoteTemplates";
import { useOrg } from "@/contexts/OrgContext";

export default function AdminSetup() {
  const {
    instances,
    activeInstance,
    createInstance,
    error: instanceError,
  } = useStripeInstances();
  const { stripeProducts, importFromStripe } = useStripePricebook();
  const { templates } = useQuoteTemplates();
  const { activeOrgId, loadMembers } = useOrg();

  const [stripeKey, setStripeKey] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);

  const stripeConnected = useMemo(() => instances.length > 0, [instances]);
  const activeInstanceName = useMemo(
    () => activeInstance?.name || "",
    [activeInstance],
  );
  const stripeMode = useMemo(() => {
    const name = activeInstanceName.toLowerCase();
    return name.includes("test") || name.includes("sandbox") ? "Test" : "Live";
  }, [activeInstanceName]);
  const hasProducts = useMemo(
    () => stripeProducts.length > 0,
    [stripeProducts],
  );
  const productCount = stripeProducts.length;
  const hasTemplates = useMemo(() => templates.length > 0, [templates]);
  const templateCount = templates.length;
  const memberCount = members.length;

  useEffect(() => {
    if (activeOrgId) {
      loadMembers(activeOrgId).then(setMembers);
    }
  }, [activeOrgId, loadMembers]);

  async function handleConnectStripe() {
    setConnecting(true);
    setConnectError(null);
    try {
      const key = stripeKey.trim();
      const inst = await createInstance({
        credentials: { api_key: key, secret_key: key },
      });
      if (!inst) {
        setConnectError(instanceError || "Failed to connect");
      } else {
        setStripeKey("");
      }
    } catch (e: any) {
      setConnectError(e.message);
    } finally {
      setConnecting(false);
    }
  }

  async function handleImportProducts() {
    setImporting(true);
    try {
      const result = await importFromStripe();
      setImportResult(result);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Setup</h2>
        <p className="text-sm text-gray-500 mt-1">
          Complete these steps to get your organization ready for quoting.
        </p>
      </div>

      <div className="space-y-4">
        {/* Step 1: Connect Stripe */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-start gap-4">
            <div
              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                stripeConnected
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {stripeConnected ? <span>&#10003;</span> : <span>1</span>}
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-gray-900">
                Connect Stripe
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Connect your Stripe account to sync products and enable
                checkout.
              </p>

              {stripeConnected ? (
                <div className="mt-3 flex items-center gap-3">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Connected
                  </span>
                  <span className="text-sm text-gray-700">
                    {activeInstanceName}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                    {stripeMode}
                  </span>
                  <Link
                    to="/org/settings"
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Manage
                  </Link>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {connectError && (
                    <div className="p-2 bg-red-50 text-red-700 rounded text-sm">
                      {connectError}
                    </div>
                  )}
                  <div className="max-w-md">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Stripe Secret Key
                    </label>
                    <input
                      type="password"
                      value={stripeKey}
                      onChange={(e) => setStripeKey(e.target.value)}
                      placeholder="sk_test_... or sk_live_..."
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      We'll auto-detect the account name and mode.
                    </p>
                  </div>
                  <button
                    onClick={handleConnectStripe}
                    disabled={!stripeKey.trim() || connecting}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg text-sm"
                  >
                    {connecting ? "Connecting..." : "Connect Stripe"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Step 2: Import Products */}
        <div
          className={`bg-white rounded-lg shadow p-6 ${!stripeConnected ? "opacity-50" : ""}`}
        >
          <div className="flex items-start gap-4">
            <div
              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                hasProducts
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {hasProducts ? <span>&#10003;</span> : <span>2</span>}
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-gray-900">
                Import Products
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Sync your product catalog from Stripe.
              </p>

              {hasProducts ? (
                <div className="mt-3 flex items-center gap-3">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    {productCount} products synced
                  </span>
                  <Link
                    to="/admin/products"
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    View Products
                  </Link>
                </div>
              ) : stripeConnected ? (
                <div className="mt-3">
                  <button
                    onClick={handleImportProducts}
                    disabled={importing}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg text-sm"
                  >
                    {importing ? "Importing..." : "Import from Stripe"}
                  </button>
                  {importResult && (
                    <div className="mt-2 text-sm text-green-600">
                      Imported {importResult.products?.created || 0} products
                      and {importResult.prices?.created || 0} prices.
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Step 3: Build Quote Template */}
        <div
          className={`bg-white rounded-lg shadow p-6 ${!hasProducts ? "opacity-50" : ""}`}
        >
          <div className="flex items-start gap-4">
            <div
              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                hasTemplates
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {hasTemplates ? <span>&#10003;</span> : <span>3</span>}
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-gray-900">
                Build Quote Template
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Create a template to define quote sections, products, pricing
                terms, and approval rules.
              </p>

              {hasTemplates ? (
                <div className="mt-3 flex items-center gap-3">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    {templateCount} template
                    {templateCount !== 1 ? "s" : ""}
                  </span>
                  <Link
                    to="/admin/quote-config"
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Manage Templates
                  </Link>
                </div>
              ) : hasProducts ? (
                <div className="mt-3">
                  <Link
                    to="/admin/quote-config"
                    className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm"
                  >
                    Create Template
                  </Link>
                  <p className="text-xs text-gray-400 mt-2">
                    Templates define sections (per-seat licenses, tiered usage,
                    one-time services), assign products to each, and configure
                    deal terms.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Step 4: Invite Team */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-start gap-4">
            <div
              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                memberCount > 1
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {memberCount > 1 ? <span>&#10003;</span> : <span>4</span>}
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-gray-900">
                Invite Team
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Add team members and set up reporting hierarchy.
              </p>

              <div className="mt-3 flex items-center gap-3">
                <span className="text-sm text-gray-700">
                  {memberCount} member{memberCount !== 1 ? "s" : ""}
                </span>
                <Link
                  to="/org/settings"
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  Manage Members
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
