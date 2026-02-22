import { useState, useMemo, useEffect } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import {
  calculateDynamicQuote,
  evaluateApprovalRules,
  TERM_DISCOUNTS as DEFAULT_TERM_DISCOUNTS,
  BILLING_DISCOUNTS as DEFAULT_BILLING_DISCOUNTS,
} from "@/lib/pricing";
import { RECORD_TYPES, validateCustomerForRecordType } from "@/lib/recordTypes";
import { useQuotes } from "@/hooks/revops/useQuotes";
import { useProducts } from "@/hooks/revops/useProducts";
import { useQuoteTemplates } from "@/hooks/revops/useQuoteTemplates";
import { useStripePricebook, BILLING_INTERVAL_MAP } from "@/hooks/revops/useStripePricebook";
import { useStripeInstances } from "@/contexts/StripeInstanceContext";
import { useAccounts } from "@/hooks/revops/useAccounts";
import { ProductTable } from "@/components/revops/ProductTable";
import { RecordTypePicker } from "@/components/revops/RecordTypePicker";
import { AccountSearch } from "@/components/revops/AccountSearch";

export default function QuoteCreate() {
  const { id } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const opportunityId = searchParams.get("opportunityId") || null;
  const navigate = useNavigate();

  // ── Hooks ──
  const { saveQuote, saveQuoteForOpportunity, updateQuote, saveAsNewVersion, getQuote } = useQuotes();
  const { products: dbProducts, toTermDiscountsMap, toBillingDiscountsMap, toTermMonthsMap } = useProducts();
  const {
    templates: rawTemplates,
    resolveTemplate,
  } = useQuoteTemplates();
  const { stripePrices, stripeProducts } = useStripePricebook();
  const { getContactsForAccount } = useAccounts();

  // ── Loading / error ──
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [editQuoteData, setEditQuoteData] = useState<any>(null);

  // ── Account / contact selection ──
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState("");
  const [accountContacts, setAccountContacts] = useState<any[]>([]);

  // ── DB-backed product data ──
  const [dbTermDiscounts, setDbTermDiscounts] = useState<Record<string, number> | null>(null);
  const [dbBillingDiscounts, setDbBillingDiscounts] = useState<Record<string, number> | null>(null);

  // ── Record type state ──
  const [selectedRecordType, setSelectedRecordType] = useState<string | null>(null);
  const [selectedStripeCustomerId, setSelectedStripeCustomerId] = useState<string | null>(null);
  const [selectedCustomerObj, setSelectedCustomerObj] = useState<any>(null);

  const customerValidation = useMemo(() => {
    if (!selectedRecordType) return { valid: true } as any;
    return validateCustomerForRecordType(selectedRecordType, selectedCustomerObj);
  }, [selectedRecordType, selectedCustomerObj]);

  // ── Template state ──
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [resolvedTemplateValue, setResolvedTemplateValue] = useState<any>(null);
  const [sectionQuantities, setSectionQuantities] = useState<Record<string, Record<string, number>>>({});
  const [hiddenProducts, setHiddenProducts] = useState<Record<string, Set<string>>>({});

  // ── Customer fields ──
  const [customer, setCustomer] = useState({
    companyName: "",
    contactName: "",
    contactTitle: "",
    contactEmail: "",
  });

  // ── Deal terms ──
  const [termLength, setTermLength] = useState("1_year");
  const [billingFrequency, setBillingFrequency] = useState("annual");
  const [paymentTermsNet, setPaymentTermsNet] = useState(30);
  const [additionalDiscount, setAdditionalDiscount] = useState(0);

  const isEditMode = !!id;
  const mode = useMemo(() => {
    if (id) return "edit";
    if (opportunityId) return "opportunity-create";
    return "standalone-create";
  }, [id, opportunityId]);

  const availableTemplates = useMemo(() => {
    if (!selectedRecordType) return rawTemplates || [];
    return (rawTemplates || []).filter((t: any) => (t.record_type || "new_customer") === selectedRecordType);
  }, [rawTemplates, selectedRecordType]);

  // Filter template products to only those with a Stripe price matching billing frequency
  const filteredTemplate = useMemo(() => {
    if (!resolvedTemplateValue) return null;
    const freq = billingFrequency;
    const config = BILLING_INTERVAL_MAP[freq];
    if (!config) return resolvedTemplateValue;

    const sections = resolvedTemplateValue.sections
      .map((section: any) => {
        if (section.type === "one_time") return section;
        const filtered = section.products.filter((p: any) =>
          stripePrices.some(
            (sp: any) =>
              sp.product_stripe_id === p.id &&
              sp.recurring_interval === config.interval &&
              sp.recurring_interval_count === config.interval_count &&
              sp.active,
          ),
        );
        return { ...section, products: filtered };
      })
      .filter((section: any) => section.products.length > 0);

    return { ...resolvedTemplateValue, sections };
  }, [resolvedTemplateValue, billingFrequency, stripePrices]);

  const showAdditionalDiscount = useMemo(() => {
    if (!resolvedTemplateValue) return true;
    return resolvedTemplateValue.allowAdditionalDiscount;
  }, [resolvedTemplateValue]);

  const activeTermDiscounts = dbTermDiscounts || DEFAULT_TERM_DISCOUNTS;
  const activeBillingDiscounts = dbBillingDiscounts || DEFAULT_BILLING_DISCOUNTS;

  const totalDiscountPct = useMemo(() => {
    const term = (activeTermDiscounts[termLength] || 0) * 100;
    const billing = (activeBillingDiscounts[billingFrequency] || 0) * 100;
    return Math.round(term + billing + additionalDiscount);
  }, [activeTermDiscounts, activeBillingDiscounts, termLength, billingFrequency, additionalDiscount]);

  // Effective quantities: clone sectionQuantities but zero out hidden items
  const effectiveSectionQuantities = useMemo(() => {
    const result: Record<string, Record<string, number>> = {};
    for (const [sectionId, products] of Object.entries(sectionQuantities)) {
      result[sectionId] = { ...products };
      const hiddenSet = hiddenProducts[sectionId];
      if (hiddenSet) {
        for (const productId of hiddenSet) {
          if (productId in result[sectionId]) {
            result[sectionId][productId] = 0;
          }
        }
      }
    }
    return result;
  }, [sectionQuantities, hiddenProducts]);

  // Dynamic quote calculation
  const calculatedQuote = useMemo(() => {
    if (!filteredTemplate) return null;
    return calculateDynamicQuote({
      template: filteredTemplate,
      sectionQuantities: effectiveSectionQuantities,
      termLength,
      billingFrequency,
      additionalDiscount,
    });
  }, [filteredTemplate, effectiveSectionQuantities, termLength, billingFrequency, additionalDiscount]);

  // Approval warnings
  const approvalWarnings = useMemo(() => {
    if (!resolvedTemplateValue || !calculatedQuote) return [];
    return evaluateApprovalRules(resolvedTemplateValue.approvalRules, {
      paymentTermsNet,
      totalDiscountPct,
      mrr: calculatedQuote.mrr,
      tcv: calculatedQuote.tcv,
    });
  }, [resolvedTemplateValue, calculatedQuote, paymentTermsNet, totalDiscountPct]);

  // ── Helpers ──
  function formatTermLabel(term: string) {
    const labels: Record<string, string> = {
      monthly: "Monthly",
      quarterly: "Quarterly",
      "1_year": "1 Year",
      "2_year": "2 Year",
      "3_year": "3 Year",
    };
    return labels[term] || term;
  }

  function formatBillingLabel(freq: string) {
    return freq.charAt(0).toUpperCase() + freq.slice(1);
  }

  function initSectionQuantities(tmpl: any) {
    if (!tmpl) return;
    const qtys: Record<string, Record<string, number>> = {};
    const hidden: Record<string, Set<string>> = {};
    for (const section of tmpl.sections) {
      qtys[section.id] = {};
      hidden[section.id] = new Set();
      for (const product of section.products) {
        qtys[section.id][product.id] = 0;
      }
    }
    setSectionQuantities(qtys);
    setHiddenProducts(hidden);
  }

  function applyTemplateDefaults(tmpl: any) {
    if (tmpl?.defaults) {
      setTermLength(tmpl.defaults.termLength);
      setBillingFrequency(tmpl.defaults.billingFrequency);
      setPaymentTermsNet(tmpl.defaults.paymentTerms);
    }
    if (!tmpl?.allowAdditionalDiscount) {
      setAdditionalDiscount(0);
    }
  }

  function onTemplateChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newTemplateId = e.target.value;
    setSelectedTemplateId(newTemplateId);
    if (!newTemplateId) {
      setResolvedTemplateValue(null);
      setSectionQuantities({});
      return;
    }
    const raw = rawTemplates.find((t: any) => t.id === newTemplateId);
    if (raw) {
      const resolved = resolveTemplate(raw, stripeProducts, stripePrices);
      setResolvedTemplateValue(resolved);
      initSectionQuantities(resolved);
      applyTemplateDefaults(resolved);
    }
  }

  function handleRecordTypeSelect(recordType: string) {
    setSelectedRecordType(recordType);
    const filtered = (rawTemplates || []).filter(
      (t: any) => (t.record_type || "new_customer") === recordType,
    );
    if (filtered.length > 0) {
      const defaultTpl = filtered.find((t: any) => t.is_default) || filtered[0];
      setSelectedTemplateId(defaultTpl.id);
      const resolved = resolveTemplate(defaultTpl, stripeProducts, stripePrices);
      setResolvedTemplateValue(resolved);
      initSectionQuantities(resolved);
      applyTemplateDefaults(resolved);
    } else {
      setSelectedTemplateId(null);
      setResolvedTemplateValue(null);
      setSectionQuantities({});
    }
  }

  function handleSwitchRecordType(newType: string) {
    setSelectedRecordType(null);
    setSelectedCustomerObj(null);
    setSelectedStripeCustomerId(null);
    handleRecordTypeSelect(newType);
  }

  // ── Account / Contact handlers ──
  async function handleAccountSelect(account: any) {
    if (!account) {
      setAccountContacts([]);
      setSelectedContactId("");
      setSelectedCustomerObj(null);
      setSelectedStripeCustomerId(null);
      return;
    }

    setSelectedCustomerObj(account);
    setSelectedStripeCustomerId(account.stripe_customer_id || null);

    if (account.isStripe) {
      setAccountContacts([]);
      setSelectedContactId("");
      if (account.email) {
        setCustomer((prev) => ({ ...prev, contactEmail: account.email }));
      }
      return;
    }

    const contacts = await getContactsForAccount(account.id);
    setAccountContacts(contacts);
    if (contacts.length > 0) {
      setSelectedContactId(contacts[0].id);
      applyContact(contacts[0]);
    }
  }

  function handleContactSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const contactId = e.target.value;
    setSelectedContactId(contactId);
    if (!contactId) {
      setCustomer((prev) => ({ ...prev, contactName: "", contactTitle: "", contactEmail: "" }));
      return;
    }
    const contact = accountContacts.find((c: any) => c.id === contactId);
    if (contact) applyContact(contact);
  }

  function applyContact(contact: any) {
    const firstName = contact.first_name || "";
    const lastName = contact.last_name || "";
    setCustomer((prev) => ({
      ...prev,
      contactName: [firstName, lastName].filter(Boolean).join(" "),
      contactTitle: contact.title || "",
      contactEmail: contact.email || "",
    }));
  }

  // ── On mount: load data + hydrate edit mode ──
  useEffect(() => {
    async function init() {
      // Products & templates are loaded by React Query via hooks; wait for stripe prices to be available
      if (dbProducts.length > 0) {
        setDbTermDiscounts(toTermDiscountsMap());
        setDbBillingDiscounts(toBillingDiscountsMap());
      }

      if (!id) return;

      setLoadingQuote(true);
      try {
        const data = await getQuote(id);
        setEditQuoteData(data);

        // Hydrate record type
        setSelectedRecordType(data.record_type || "new_customer");
        setSelectedStripeCustomerId(data.stripe_customer_id || null);

        // Prefill customer from opportunity
        const opp = data.opportunity;
        if (opp) {
          setCustomer({
            companyName: opp.accounts?.name || "",
            contactName: [opp.contacts?.first_name, opp.contacts?.last_name].filter(Boolean).join(" "),
            contactTitle: opp.contacts?.title || "",
            contactEmail: opp.contacts?.email || "",
          });
        }

        // Prefill deal terms
        setTermLength(data.term_length || "1_year");
        setBillingFrequency(data.billing_frequency || "annual");
        setPaymentTermsNet(data.payment_terms_net || 30);
        setAdditionalDiscount(data.additional_discount || 0);

        // Resolve template if present
        if (data.template_id && rawTemplates.length > 0) {
          const raw = rawTemplates.find((t: any) => t.id === data.template_id);
          if (raw) {
            setSelectedTemplateId(data.template_id);
            const resolved = resolveTemplate(raw, stripeProducts, stripePrices);
            setResolvedTemplateValue(resolved);
            initSectionQuantities(resolved);

            // Rebuild sectionQuantities from saved line items
            if (data.quote_line_items && resolved) {
              const qtys: Record<string, Record<string, number>> = {};
              for (const section of resolved.sections) {
                qtys[section.id] = {};
                for (const product of section.products) {
                  qtys[section.id][product.id] = 0;
                }
              }
              for (const item of data.quote_line_items) {
                if (item.section_name && item.stripe_product_stripe_id) {
                  const section = resolved.sections.find((s: any) => s.name === item.section_name);
                  if (section && qtys[section.id]) {
                    qtys[section.id][item.stripe_product_stripe_id] = item.quantity;
                  }
                }
              }
              setSectionQuantities(qtys);
            }

            // Hydrate hiddenProducts from saved line items
            if (data.quote_line_items && resolved) {
              const hp: Record<string, Set<string>> = {};
              for (const section of resolved.sections) {
                hp[section.id] = new Set();
              }
              for (const item of data.quote_line_items) {
                if (item.hidden && item.section_name && item.stripe_product_stripe_id) {
                  const section = resolved.sections.find((s: any) => s.name === item.section_name);
                  if (section && hp[section.id]) {
                    hp[section.id].add(item.stripe_product_stripe_id);
                  }
                }
              }
              if (data.quote_services) {
                for (const svc of data.quote_services) {
                  if (svc.hidden && svc.service_id) {
                    for (const section of resolved.sections) {
                      if (section.type === "one_time" && hp[section.id]) {
                        const match = section.products.find((p: any) => p.id === svc.service_id);
                        if (match) hp[section.id].add(svc.service_id);
                      }
                    }
                  }
                }
              }
              setHiddenProducts(hp);
            }
          }
        } else {
          setResolvedTemplateValue(null);
          setSelectedTemplateId(null);
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoadingQuote(false);
      }
    }

    // Only run init when templates + stripe data are loaded
    if (rawTemplates.length > 0 || !id) {
      init();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, rawTemplates.length, stripeProducts.length, stripePrices.length, dbProducts.length]);

  // ── Save ──
  const canSave = useMemo(() => {
    if (isEditMode) return true;
    if (!selectedRecordType) return false;
    if (!customer.companyName) return false;
    if (!customerValidation.valid) return false;
    const q = calculatedQuote;
    if (!q || (q.mrr <= 0 && q.tcv <= 0)) return false;
    return true;
  }, [isEditMode, selectedRecordType, customer.companyName, customerValidation.valid, calculatedQuote]);

  function buildSaveParams() {
    return {
      customer,
      quote: calculatedQuote,
      termLength,
      billingFrequency,
      paymentTermsNet,
      additionalDiscount,
      recordType: selectedRecordType || "new_customer",
      stripeCustomerId: selectedStripeCustomerId || null,
      templateId: resolvedTemplateValue?.id || null,
      calculatedQuote,
      sectionQuantities,
      hiddenProducts,
      resolvedTemplate: filteredTemplate,
      featureQuantities: {},
      selectedDeployment: null,
      meetingIntelligenceHours: 0,
      liveCoachingHours: 0,
      plan: "custom",
    };
  }

  async function handleSave() {
    setLoading(true);
    setError(null);
    try {
      const params = buildSaveParams();
      if (mode === "edit") {
        const result = await updateQuote(id!, params);
        if (result) navigate(`/revops/opportunity/${editQuoteData.opportunity_id}`);
      } else if (mode === "opportunity-create") {
        const result = await saveQuoteForOpportunity(opportunityId!, params);
        if (result) navigate(`/revops/opportunity/${opportunityId}`);
      } else {
        const result = await saveQuote(params);
        if (result) navigate(`/revops/opportunity/${result.opportunity.id}`);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveAsNewVersion() {
    setLoading(true);
    setError(null);
    try {
      const params = buildSaveParams();
      const result = await saveAsNewVersion(id!, params);
      if (result) navigate(`/revops/opportunity/${editQuoteData.opportunity_id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Render ──
  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div>
        {error && (
          <div className="mb-6 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
        )}

        {loadingQuote ? (
          <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
        ) : !selectedRecordType && !isEditMode ? (
          /* Record Type Picker */
          <div className="bg-white rounded-lg shadow p-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">What type of deal is this?</h2>
            <p className="text-sm text-gray-500 mb-6">
              Select a record type to get started. This determines which templates and customer options are available.
            </p>
            <RecordTypePicker value={selectedRecordType} onSelect={handleRecordTypeSelect} />
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow">
            {/* Quote Title + Record Type Badge */}
            <div className="px-6 pt-6 pb-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {!isEditMode && (
                    <button
                      onClick={() => setSelectedRecordType(null)}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                      title="Change record type"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                  )}
                  <h2 className="text-lg font-semibold text-gray-900">
                    {resolvedTemplateValue ? resolvedTemplateValue.name : "Cirrus Flex Software & Services Quote"}
                  </h2>
                  {selectedRecordType && (
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        selectedRecordType === "new_customer"
                          ? "bg-blue-100 text-blue-800"
                          : selectedRecordType === "upsell"
                            ? "bg-green-100 text-green-800"
                            : "bg-purple-100 text-purple-800"
                      }`}
                    >
                      {RECORD_TYPES[selectedRecordType]?.label}
                    </span>
                  )}
                </div>
                {/* Template selector */}
                {availableTemplates.length > 1 ? (
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-500">Template:</label>
                    <select
                      value={selectedTemplateId || ""}
                      onChange={onTemplateChange}
                      className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {availableTemplates.map((t: any) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : availableTemplates.length === 0 && selectedRecordType ? (
                  <div className="text-sm text-amber-600">
                    No templates for this record type.{" "}
                    <Link to="/revops/admin/quote-config" className="underline hover:text-amber-800">
                      Configure in Quote Config
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Customer Validation Warning Bar */}
            {customerValidation.warning && (
              <div
                className={`px-6 py-3 border-b ${
                  customerValidation.valid ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"
                }`}
              >
                <div
                  className={`flex items-center gap-2 text-sm ${
                    customerValidation.valid ? "text-amber-800" : "text-red-800"
                  }`}
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>{customerValidation.warning}</span>
                  {customerValidation.suggestedRecordType && (
                    <button
                      onClick={() => handleSwitchRecordType(customerValidation.suggestedRecordType)}
                      className="ml-2 underline font-medium hover:opacity-80"
                    >
                      {customerValidation.suggestion}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Customer Info (left) + Deal Terms (right) */}
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="grid grid-cols-2 gap-x-12 gap-y-1.5">
                {/* Row 1 */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Customer Name</span>
                  {!isEditMode ? (
                    <AccountSearch
                      value={customer.companyName}
                      onValueChange={(val: string) => setCustomer((prev) => ({ ...prev, companyName: val }))}
                      accountId={selectedAccountId}
                      onAccountIdChange={setSelectedAccountId}
                      recordType={selectedRecordType}
                      onSelect={handleAccountSelect}
                      placeholder="Search company..."
                      inputClassName="text-sm text-right font-medium text-gray-900 border-0 bg-transparent focus:ring-0 p-0 w-48"
                    />
                  ) : (
                    <span className="text-sm font-medium text-gray-900">{customer.companyName || "N/A"}</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Billing Frequency</span>
                  <select
                    value={billingFrequency}
                    onChange={(e) => setBillingFrequency(e.target.value)}
                    className="text-sm text-right border-0 bg-transparent font-medium text-gray-900 cursor-pointer focus:ring-0 pr-6"
                  >
                    {resolvedTemplateValue ? (
                      resolvedTemplateValue.billingFrequencies.map((opt: string) => (
                        <option key={opt} value={opt}>
                          {formatBillingLabel(opt)}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="annual">Annual</option>
                      </>
                    )}
                  </select>
                </div>

                {/* Row 2 */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Prepared For</span>
                  {!isEditMode ? (
                    <div className="flex items-center gap-1">
                      {accountContacts.length > 0 ? (
                        <select
                          value={selectedContactId}
                          onChange={handleContactSelect}
                          className="text-sm text-right border-0 bg-transparent font-medium text-gray-900 cursor-pointer focus:ring-0 pr-6"
                        >
                          <option value="">New Contact</option>
                          {accountContacts.map((c: any) => (
                            <option key={c.id} value={c.id}>
                              {[c.first_name, c.last_name].filter(Boolean).join(" ")}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={customer.contactName}
                          onChange={(e) => setCustomer((prev) => ({ ...prev, contactName: e.target.value }))}
                          placeholder="Contact Name"
                          className="text-sm text-right font-medium text-gray-900 border-0 bg-transparent focus:ring-0 p-0 w-40"
                        />
                      )}
                    </div>
                  ) : (
                    <span className="text-sm font-medium text-gray-900">{customer.contactName || "N/A"}</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Term</span>
                  <select
                    value={termLength}
                    onChange={(e) => setTermLength(e.target.value)}
                    className="text-sm text-right border-0 bg-transparent font-medium text-gray-900 cursor-pointer focus:ring-0 pr-6"
                  >
                    {resolvedTemplateValue ? (
                      resolvedTemplateValue.termLengths.map((opt: string) => (
                        <option key={opt} value={opt}>
                          {formatTermLabel(opt)}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="1_year">1 Year</option>
                        <option value="2_year">2 Year</option>
                        <option value="3_year">3 Year</option>
                      </>
                    )}
                  </select>
                </div>

                {/* Row 3 */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Contact Title</span>
                  {!isEditMode ? (
                    <input
                      type="text"
                      value={customer.contactTitle}
                      onChange={(e) => setCustomer((prev) => ({ ...prev, contactTitle: e.target.value }))}
                      placeholder="Director of Rev Ops"
                      className="text-sm text-right font-medium text-gray-900 border-0 bg-transparent focus:ring-0 p-0 w-40"
                    />
                  ) : (
                    <span className="text-sm font-medium text-gray-900">{customer.contactTitle || "N/A"}</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Payment Terms Net</span>
                  <select
                    value={paymentTermsNet}
                    onChange={(e) => setPaymentTermsNet(Number(e.target.value))}
                    className="text-sm text-right border-0 bg-transparent font-medium text-gray-900 cursor-pointer focus:ring-0 pr-6"
                  >
                    {resolvedTemplateValue ? (
                      resolvedTemplateValue.paymentTerms.map((opt: number) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value={30}>30</option>
                        <option value={45}>45</option>
                        <option value={60}>60</option>
                      </>
                    )}
                  </select>
                </div>

                {/* Row 4 */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Email Address</span>
                  {!isEditMode ? (
                    <input
                      type="email"
                      value={customer.contactEmail}
                      onChange={(e) => setCustomer((prev) => ({ ...prev, contactEmail: e.target.value }))}
                      placeholder="email@email.com"
                      className="text-sm text-right font-medium text-gray-900 border-0 bg-transparent focus:ring-0 p-0 w-40"
                    />
                  ) : (
                    <span className="text-sm font-medium text-gray-900">{customer.contactEmail || "N/A"}</span>
                  )}
                </div>
                {showAdditionalDiscount && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Additional Discount %</span>
                    <input
                      type="number"
                      value={additionalDiscount}
                      onChange={(e) => setAdditionalDiscount(Number(e.target.value) || 0)}
                      min={0}
                      max={100}
                      step={1}
                      className="w-16 text-sm text-right border-0 bg-transparent font-medium text-gray-900 cursor-pointer focus:ring-0 pr-6"
                    />
                  </div>
                )}
              </div>

              {/* Approval warnings */}
              <div className="mt-2 flex flex-wrap gap-2">
                {approvalWarnings.map((warning: any, i: number) => (
                  <div
                    key={i}
                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800"
                    data-testid="approval-warning"
                  >
                    {warning.interpolatedMessage}
                  </div>
                ))}
              </div>
            </div>

            {/* Product Table */}
            {filteredTemplate && (
              <ProductTable
                template={filteredTemplate}
                sectionQuantities={sectionQuantities}
                onSectionQuantitiesChange={setSectionQuantities}
                hiddenProducts={hiddenProducts}
                onHiddenProductsChange={setHiddenProducts}
                calculatedQuote={calculatedQuote}
                termLength={termLength}
                billingFrequency={billingFrequency}
                additionalDiscount={additionalDiscount}
              />
            )}

            {/* Quick Preview */}
            {calculatedQuote && (calculatedQuote.mrr > 0 || calculatedQuote.tcv > 0) && (
              <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
                <div className="flex items-center gap-6 text-sm">
                  <div>
                    <span className="text-gray-500">MRR</span>
                    <span className="ml-1 font-semibold text-gray-900">
                      ${Number(calculatedQuote.mrr).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">ARR</span>
                    <span className="ml-1 font-semibold text-gray-900">
                      ${Number(calculatedQuote.arr).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">TCV</span>
                    <span className="ml-1 font-semibold text-blue-700 text-base">
                      ${Number(calculatedQuote.tcv).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Save */}
            <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
              <button
                onClick={handleSave}
                disabled={loading || !canSave}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-6 rounded-lg transition-colors text-sm"
              >
                {loading ? "Saving..." : "Save Quote"}
              </button>
              {isEditMode && (
                <button
                  onClick={handleSaveAsNewVersion}
                  disabled={loading}
                  className="bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed text-gray-700 font-medium py-2 px-6 rounded-lg border border-gray-300 transition-colors text-sm"
                >
                  {loading ? "Saving..." : "Save as New Version"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
