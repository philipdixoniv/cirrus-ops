import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuoteTemplates } from "@/hooks/revops/useQuoteTemplates";
import { useStripePricebook } from "@/hooks/revops/useStripePricebook";
import { useStripeInstances } from "@/hooks/revops/useStripeInstances";
import { RECORD_TYPES, RECORD_TYPE_LIST } from "@/lib/recordTypes";

/* ---------- constants ---------- */

const DETAIL_TABS = [
  { id: "sections", label: "Sections" },
  { id: "deal_terms", label: "Deal Terms" },
  { id: "discounts", label: "Discounts" },
  { id: "approvals", label: "Approvals" },
] as const;

type DetailTabId = (typeof DETAIL_TABS)[number]["id"];

const ALL_TERM_LENGTHS = [
  "monthly",
  "quarterly",
  "1_year",
  "2_year",
  "3_year",
];
const ALL_BILLING_FREQUENCIES = ["monthly", "quarterly", "annual"];
const ALL_PAYMENT_TERMS = [30, 45, 60];

/* ---------- helpers ---------- */

function formatTermLabel(term: string): string {
  const labels: Record<string, string> = {
    monthly: "Monthly",
    quarterly: "Quarterly",
    "1_year": "1 Year",
    "2_year": "2 Year",
    "3_year": "3 Year",
  };
  return labels[term] || term;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function toggleInArray<T>(arr: T[], item: T): T[] {
  const idx = arr.indexOf(item);
  if (idx >= 0) {
    const next = [...arr];
    next.splice(idx, 1);
    return next;
  }
  return [...arr, item];
}

function sidebarFilterClass(
  rtColor: string,
  isActive: boolean,
): string {
  if (isActive) {
    if (rtColor === "blue") return "bg-blue-600 text-white";
    if (rtColor === "green") return "bg-green-600 text-white";
    if (rtColor === "purple") return "bg-purple-600 text-white";
    return "bg-gray-800 text-white";
  }
  if (rtColor === "blue") return "bg-blue-50 text-blue-700 hover:bg-blue-100";
  if (rtColor === "green")
    return "bg-green-50 text-green-700 hover:bg-green-100";
  if (rtColor === "purple")
    return "bg-purple-50 text-purple-700 hover:bg-purple-100";
  return "bg-gray-100 text-gray-600 hover:bg-gray-200";
}

function recordTypeBadgeClass(recordType: string): string {
  if (recordType === "upsell") return "bg-green-100 text-green-700";
  if (recordType === "renewal") return "bg-purple-100 text-purple-700";
  return "bg-blue-100 text-blue-700";
}

/* ---------- AdminQuoteConfig ---------- */

export default function AdminQuoteConfig() {
  const {
    templates,
    loading,
    error,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    setDefaultTemplate,
    createSection,
    deleteSection,
    addProductToSection,
    addProductsToSection,
    removeProductFromSection,
  } = useQuoteTemplates();

  const {
    stripeProducts,
    stripePrices,
    inferProductType,
  } = useStripePricebook();

  const {
    instances,
    activeInstanceId,
    switchInstance,
  } = useStripeInstances();

  const { refetch: refetchPricebook } = useStripePricebook();

  const instancesList = instances;

  /* ---------- state ---------- */
  const [activeTab, setActiveTab] = useState<DetailTabId>("sections");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  );
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showAddSection, setShowAddSection] = useState(false);
  const [sidebarFilter, setSidebarFilter] = useState("all");

  const [newTemplate, setNewTemplate] = useState({
    name: "",
    description: "",
    record_type: "new_customer",
  });
  const [newSection, setNewSection] = useState({
    name: "",
    section_type: "per_seat",
    discount_applicable: true,
  });

  // Product picker
  const [addProductPickerOpen, setAddProductPickerOpen] = useState<
    Record<string, boolean>
  >({});
  const [productPickerSelection, setProductPickerSelection] = useState<
    Record<string, Set<string>>
  >({});

  // Product inline editing
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editProductDisplayName, setEditProductDisplayName] = useState("");
  const [editProductUnitLabel, setEditProductUnitLabel] = useState("");

  // Deal Terms
  const [editDealTerms, setEditDealTerms] = useState({
    term_lengths: [] as string[],
    billing_frequencies: [] as string[],
    payment_terms: [] as number[],
    default_term_length: "1_year",
    default_billing_frequency: "annual",
    default_payment_terms: 30,
  });

  // Discounts
  const [editDiscounts, setEditDiscounts] = useState({
    term_discounts: {} as Record<string, number>,
    billing_discounts: {} as Record<string, number>,
    term_months_map: {} as Record<string, number | undefined>,
    allow_additional_discount: false,
  });

  // Approval Rules
  const [editApprovalRules, setEditApprovalRules] = useState<any[]>([]);

  /* ---------- derived ---------- */
  const filteredTemplates = useMemo(() => {
    if (sidebarFilter === "all") return templates;
    return templates.filter(
      (t: any) => (t.record_type || "new_customer") === sidebarFilter,
    );
  }, [templates, sidebarFilter]);

  const selectedTemplate = useMemo(
    () => templates.find((t: any) => t.id === selectedTemplateId) || null,
    [templates, selectedTemplateId],
  );

  const templateSections: any[] = useMemo(
    () => selectedTemplate?.quote_template_sections || [],
    [selectedTemplate],
  );

  /* ---------- Sync template selection into edit states ---------- */
  useEffect(() => {
    if (!selectedTemplate) return;
    const t = selectedTemplate;
    setEditDealTerms({
      term_lengths: [...(t.term_lengths || [])],
      billing_frequencies: [...(t.billing_frequencies || [])],
      payment_terms: [...(t.payment_terms || [])],
      default_term_length: t.default_term_length || "1_year",
      default_billing_frequency: t.default_billing_frequency || "annual",
      default_payment_terms: t.default_payment_terms || 30,
    });
    setEditDiscounts({
      term_discounts: { ...(t.term_discounts || {}) },
      billing_discounts: { ...(t.billing_discounts || {}) },
      term_months_map: { ...(t.term_months_map || {}) },
      allow_additional_discount: t.allow_additional_discount || false,
    });
    setEditApprovalRules(
      (t.approval_rules || []).map((r: any) => ({ ...r })),
    );
  }, [selectedTemplate]);

  /* ---------- Auto-select first template on load ---------- */
  useEffect(() => {
    if (templates.length > 0 && !selectedTemplateId) {
      setSelectedTemplateId(templates[0].id);
    }
  }, [templates, selectedTemplateId]);

  /* ---------- product filtering ---------- */
  const filteredStripeProducts = useCallback(
    (sectionType: string) => {
      return stripeProducts.filter((p: any) => {
        const type = inferProductType(p);
        if (sectionType === "per_seat") return type === "per_seat";
        if (sectionType === "tiered") return type === "tiered";
        if (sectionType === "one_time") return type === "one_time";
        return true;
      });
    },
    [stripeProducts, inferProductType],
  );

  function resolveProductName(stripeId: string): string {
    const product = stripeProducts.find((p: any) => p.stripe_id === stripeId);
    return product?.name || stripeId;
  }

  function resolveProductPrice(stripeId: string, sectionType: string): string {
    const prices = stripePrices.filter(
      (p: any) => p.product_stripe_id === stripeId,
    );
    if (prices.length === 0) return "No price";
    if (sectionType === "one_time") {
      const oneTime = prices.find((p: any) => p.type === "one_time");
      return oneTime
        ? `$${(oneTime.unit_amount / 100).toLocaleString()} one-time`
        : "No price";
    }
    if (sectionType === "tiered") {
      const tiered = prices.find((p: any) => p.billing_scheme === "tiered");
      return tiered ? "Tiered pricing" : "No tiers";
    }
    const monthly = prices.find(
      (p: any) =>
        p.recurring_interval === "month" && p.recurring_interval_count === 1,
    );
    if (monthly?.unit_amount != null)
      return `$${(monthly.unit_amount / 100).toLocaleString()}/mo`;
    const annual = prices.find(
      (p: any) =>
        p.recurring_interval === "year" && p.recurring_interval_count === 1,
    );
    if (annual?.unit_amount != null)
      return `$${(annual.unit_amount / 100 / 12).toLocaleString()}/mo (annual)`;
    return "No recurring price";
  }

  function availableProductsForSection(section: any): any[] {
    const existing = new Set(
      (section.quote_template_section_products || []).map(
        (sp: any) => sp.stripe_product_stripe_id,
      ),
    );
    return filteredStripeProducts(section.section_type).filter(
      (p: any) => !existing.has(p.stripe_id),
    );
  }

  function allProductsSelected(section: any): boolean {
    const available = availableProductsForSection(section);
    const selected = productPickerSelection[section.id];
    return !!selected && available.length > 0 && selected.size === available.length;
  }

  /* ---------- handlers ---------- */
  async function handleInstanceSwitch(instanceId: string) {
    switchInstance(instanceId);
    await refetchPricebook();
  }

  async function handleCreateTemplate() {
    const result = await createTemplate({
      name: newTemplate.name,
      description: newTemplate.description || null,
      record_type: newTemplate.record_type || "new_customer",
    });
    if (result) {
      setSelectedTemplateId(result.id);
      setShowCreateForm(false);
      setNewTemplate({ name: "", description: "", record_type: "new_customer" });
    }
  }

  async function handleDeleteTemplate() {
    if (!selectedTemplate) return;
    await deleteTemplate(selectedTemplate.id);
    setSelectedTemplateId(templates[0]?.id || null);
  }

  async function handleSetDefault() {
    if (!selectedTemplate) return;
    await setDefaultTemplate(selectedTemplate.id);
  }

  async function handleCreateSection() {
    if (!selectedTemplate) return;
    await createSection(selectedTemplate.id, { ...newSection });
    setShowAddSection(false);
    setNewSection({ name: "", section_type: "per_seat", discount_applicable: true });
  }

  async function handleDeleteSection(sectionId: string) {
    await deleteSection(sectionId);
  }

  function openProductPicker(sectionId: string) {
    setAddProductPickerOpen((prev) => ({ ...prev, [sectionId]: true }));
    setProductPickerSelection((prev) => ({
      ...prev,
      [sectionId]: new Set(),
    }));
  }

  function toggleProductSelection(sectionId: string, stripeId: string) {
    setProductPickerSelection((prev) => {
      const current = new Set(prev[sectionId] || []);
      if (current.has(stripeId)) current.delete(stripeId);
      else current.add(stripeId);
      return { ...prev, [sectionId]: current };
    });
  }

  function toggleAllProducts(section: any) {
    const available = availableProductsForSection(section);
    if (allProductsSelected(section)) {
      setProductPickerSelection((prev) => ({
        ...prev,
        [section.id]: new Set(),
      }));
    } else {
      setProductPickerSelection((prev) => ({
        ...prev,
        [section.id]: new Set(available.map((p: any) => p.stripe_id)),
      }));
    }
  }

  async function handleAddSelectedProducts(sectionId: string) {
    const selected = productPickerSelection[sectionId];
    if (!selected?.size) return;
    const items = [...selected].map((stripeId) => {
      const product = stripeProducts.find(
        (p: any) => p.stripe_id === stripeId,
      );
      return {
        stripe_product_stripe_id: stripeId,
        display_name: product?.name || null,
        unit_label: product?.unit_label || "Active User",
      };
    });
    await addProductsToSection(sectionId, items);
    setAddProductPickerOpen((prev) => ({ ...prev, [sectionId]: false }));
    setProductPickerSelection((prev) => ({
      ...prev,
      [sectionId]: new Set(),
    }));
  }

  async function handleRemoveProduct(productId: string) {
    await removeProductFromSection(productId);
  }

  function startEditProduct(sp: any) {
    setEditingProductId(sp.id);
    setEditProductDisplayName(
      sp.display_name || resolveProductName(sp.stripe_product_stripe_id),
    );
    setEditProductUnitLabel(sp.unit_label || "Active User");
  }

  async function handleSaveProductEdit(sp: any) {
    await removeProductFromSection(sp.id);
    const sectionId =
      templateSections.find((s: any) =>
        (s.quote_template_section_products || []).some(
          (p: any) => p.id === sp.id,
        ),
      )?.id || sp.section_id;
    await addProductToSection(sp.section_id || sectionId, {
      stripe_product_stripe_id: sp.stripe_product_stripe_id,
      display_name: editProductDisplayName,
      unit_label: editProductUnitLabel,
    });
    setEditingProductId(null);
  }

  async function handleSaveDealTerms() {
    if (!selectedTemplate) return;
    await updateTemplate(selectedTemplate.id, {
      term_lengths: editDealTerms.term_lengths,
      billing_frequencies: editDealTerms.billing_frequencies,
      payment_terms: editDealTerms.payment_terms,
      default_term_length: editDealTerms.default_term_length,
      default_billing_frequency: editDealTerms.default_billing_frequency,
      default_payment_terms: editDealTerms.default_payment_terms,
    });
  }

  async function handleSaveDiscounts() {
    if (!selectedTemplate) return;
    const cleanMap: Record<string, number> = {};
    for (const [k, v] of Object.entries(editDiscounts.term_months_map)) {
      if (v !== undefined && v !== null) cleanMap[k] = v;
    }
    await updateTemplate(selectedTemplate.id, {
      term_discounts: editDiscounts.term_discounts,
      billing_discounts: editDiscounts.billing_discounts,
      term_months_map: cleanMap,
      allow_additional_discount: editDiscounts.allow_additional_discount,
    });
  }

  function addApprovalRule() {
    setEditApprovalRules((prev) => [
      ...prev,
      {
        type: "paymentTermsNet",
        operator: ">=",
        value: 45,
        message: "Requires management approval",
      },
    ]);
  }

  function removeApprovalRule(idx: number) {
    setEditApprovalRules((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateApprovalRule(idx: number, key: string, value: any) {
    setEditApprovalRules((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [key]: value } : r)),
    );
  }

  async function handleSaveApprovalRules() {
    if (!selectedTemplate) return;
    await updateTemplate(selectedTemplate.id, {
      approval_rules: editApprovalRules,
    });
  }

  /* ---------- render ---------- */
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Quote Templates</h2>
        <div className="flex items-center gap-3">
          {/* Instance Selector */}
          {instancesList.length > 1 ? (
            <select
              value={activeInstanceId || ""}
              onChange={(e) => handleInstanceSwitch(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {instancesList.map((inst: any) => (
                <option key={inst.id} value={inst.id}>
                  {inst.name}
                </option>
              ))}
            </select>
          ) : instancesList.length === 1 ? (
            <span className="text-sm text-gray-500">
              {instancesList[0].name}
            </span>
          ) : null}
          <button
            onClick={() => setShowCreateForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm"
          >
            + New Template
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Create Template Form */}
      {showCreateForm && (
        <div className="mb-6 bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">New Template</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                value={newTemplate.name}
                onChange={(e) =>
                  setNewTemplate((p) => ({ ...p, name: e.target.value }))
                }
                type="text"
                placeholder="e.g. Standard SaaS Quote"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <input
                value={newTemplate.description}
                onChange={(e) =>
                  setNewTemplate((p) => ({
                    ...p,
                    description: e.target.value,
                  }))
                }
                type="text"
                placeholder="Optional description"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Record Type
              </label>
              <select
                value={newTemplate.record_type}
                onChange={(e) =>
                  setNewTemplate((p) => ({
                    ...p,
                    record_type: e.target.value,
                  }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
              >
                {RECORD_TYPE_LIST.map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleCreateTemplate}
              disabled={!newTemplate.name}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg text-sm"
            >
              Create
            </button>
            <button
              onClick={() => setShowCreateForm(false)}
              className="bg-white hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded-lg border border-gray-300 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-6">
        {/* ==================== Left sidebar: Template list ==================== */}
        <div className="w-64 flex-shrink-0">
          {/* Sidebar filter tabs */}
          <div className="flex gap-1 mb-3 flex-wrap">
            <button
              onClick={() => setSidebarFilter("all")}
              className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
                sidebarFilter === "all"
                  ? "bg-gray-800 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              All
            </button>
            {RECORD_TYPE_LIST.map((rt) => (
              <button
                key={rt.id}
                onClick={() => setSidebarFilter(rt.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${sidebarFilterClass(rt.color, sidebarFilter === rt.id)}`}
              >
                {rt.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              Loading...
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              No templates yet. Create one to get started.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTemplates.map((t: any) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTemplateId(t.id)}
                  className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors ${
                    selectedTemplateId === t.id
                      ? "border-blue-500 bg-blue-50 text-blue-900"
                      : "border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium flex-1">{t.name}</span>
                    <span
                      className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${recordTypeBadgeClass(t.record_type || "new_customer")}`}
                    >
                      {
                        RECORD_TYPES[t.record_type || "new_customer"]
                          ?.label
                      }
                    </span>
                  </div>
                  {t.is_default && (
                    <div className="mt-0.5 text-xs text-blue-600 font-medium">
                      Default
                    </div>
                  )}
                  {t.description && (
                    <div className="mt-0.5 text-xs text-gray-500 truncate">
                      {t.description}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ==================== Right content: Template detail ==================== */}
        <div className="flex-1 min-w-0">
          {!selectedTemplate ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              Select a template from the left to configure it.
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow">
              {/* Template header */}
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {selectedTemplate.name}
                  </h2>
                  {selectedTemplate.description && (
                    <p className="text-sm text-gray-500 mt-0.5">
                      {selectedTemplate.description}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {!selectedTemplate.is_default && (
                    <button
                      onClick={handleSetDefault}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Set as Default
                    </button>
                  )}
                  <button
                    onClick={handleDeleteTemplate}
                    className="text-sm text-red-600 hover:text-red-800 font-medium"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="border-b border-gray-200">
                <nav className="flex px-6 -mb-px">
                  {DETAIL_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === tab.id
                          ? "border-blue-500 text-blue-600"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </nav>
              </div>

              {/* Tab Content */}
              <div className="p-6">
                {/* ===== Sections Tab ===== */}
                {activeTab === "sections" && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                        Sections
                      </h3>
                      <button
                        onClick={() => setShowAddSection(true)}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                      >
                        + Add Section
                      </button>
                    </div>

                    {/* Add Section Form */}
                    {showAddSection && (
                      <div className="mb-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Name
                            </label>
                            <input
                              value={newSection.name}
                              onChange={(e) =>
                                setNewSection((p) => ({
                                  ...p,
                                  name: e.target.value,
                                }))
                              }
                              type="text"
                              placeholder="e.g. Platform Licenses"
                              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Type
                            </label>
                            <select
                              value={newSection.section_type}
                              onChange={(e) =>
                                setNewSection((p) => ({
                                  ...p,
                                  section_type: e.target.value,
                                }))
                              }
                              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                            >
                              <option value="per_seat">Per Seat</option>
                              <option value="tiered">Tiered</option>
                              <option value="one_time">One-Time</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Discount Applicable
                            </label>
                            <label className="flex items-center gap-2 mt-1.5">
                              <input
                                type="checkbox"
                                checked={newSection.discount_applicable}
                                onChange={(e) =>
                                  setNewSection((p) => ({
                                    ...p,
                                    discount_applicable: e.target.checked,
                                  }))
                                }
                                className="rounded"
                              />
                              <span className="text-sm text-gray-700">
                                Yes
                              </span>
                            </label>
                          </div>
                        </div>
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={handleCreateSection}
                            disabled={!newSection.name}
                            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm py-1.5 px-3 rounded"
                          >
                            Add
                          </button>
                          <button
                            onClick={() => setShowAddSection(false)}
                            className="text-sm text-gray-600 hover:text-gray-800 py-1.5 px-3"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Section List */}
                    {templateSections.length === 0 ? (
                      <div className="text-sm text-gray-400 py-4">
                        No sections yet. Add one to start assigning products.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {templateSections.map((section: any) => (
                          <div
                            key={section.id}
                            className="border border-gray-200 rounded-lg"
                          >
                            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between rounded-t-lg">
                              <div>
                                <span className="font-medium text-sm text-gray-900">
                                  {section.name}
                                </span>
                                <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">
                                  {section.section_type}
                                </span>
                                {section.discount_applicable && (
                                  <span className="ml-1 text-xs text-green-600">
                                    discountable
                                  </span>
                                )}
                              </div>
                              <button
                                onClick={() =>
                                  handleDeleteSection(section.id)
                                }
                                className="text-xs text-red-500 hover:text-red-700"
                              >
                                Remove
                              </button>
                            </div>

                            {/* Products in section */}
                            <div className="p-4">
                              {(
                                section.quote_template_section_products || []
                              ).length > 0 && (
                                <div className="space-y-2 mb-3">
                                  {(
                                    section.quote_template_section_products ||
                                    []
                                  ).map((sp: any) => (
                                    <div
                                      key={sp.id}
                                      className="flex items-center gap-3 py-2 px-3 bg-white border border-gray-100 rounded text-sm"
                                    >
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          {editingProductId === sp.id ? (
                                            <input
                                              value={editProductDisplayName}
                                              onChange={(e) =>
                                                setEditProductDisplayName(
                                                  e.target.value,
                                                )
                                              }
                                              type="text"
                                              className="border border-gray-300 rounded px-2 py-1 text-sm font-medium w-48"
                                              placeholder="Display name"
                                            />
                                          ) : (
                                            <span className="font-medium text-gray-800">
                                              {sp.display_name ||
                                                resolveProductName(
                                                  sp.stripe_product_stripe_id,
                                                )}
                                            </span>
                                          )}
                                          <span className="text-xs text-gray-400 font-mono">
                                            {sp.stripe_product_stripe_id.slice(
                                              0,
                                              20,
                                            )}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-3 mt-0.5">
                                          <span className="text-xs text-green-600 font-medium">
                                            {resolveProductPrice(
                                              sp.stripe_product_stripe_id,
                                              section.section_type,
                                            )}
                                          </span>
                                          {editingProductId === sp.id ? (
                                            <input
                                              value={editProductUnitLabel}
                                              onChange={(e) =>
                                                setEditProductUnitLabel(
                                                  e.target.value,
                                                )
                                              }
                                              type="text"
                                              className="border border-gray-300 rounded px-2 py-0.5 text-xs w-32"
                                              placeholder="Unit label"
                                            />
                                          ) : (
                                            <span className="text-xs text-gray-400">
                                              {sp.unit_label ||
                                                "Active User"}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        {editingProductId === sp.id ? (
                                          <>
                                            <button
                                              onClick={() =>
                                                handleSaveProductEdit(sp)
                                              }
                                              className="text-xs text-green-600 hover:text-green-800 font-medium"
                                            >
                                              Save
                                            </button>
                                            <button
                                              onClick={() =>
                                                setEditingProductId(null)
                                              }
                                              className="text-xs text-gray-500 hover:text-gray-700"
                                            >
                                              Cancel
                                            </button>
                                          </>
                                        ) : (
                                          <>
                                            <button
                                              onClick={() =>
                                                startEditProduct(sp)
                                              }
                                              className="text-xs text-blue-500 hover:text-blue-700"
                                            >
                                              Edit
                                            </button>
                                            <button
                                              onClick={() =>
                                                handleRemoveProduct(sp.id)
                                              }
                                              className="text-xs text-red-500 hover:text-red-700"
                                            >
                                              Remove
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Add products to section */}
                              {availableProductsForSection(section).length >
                              0 ? (
                                <>
                                  {!addProductPickerOpen[section.id] ? (
                                    <button
                                      onClick={() =>
                                        openProductPicker(section.id)
                                      }
                                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                                    >
                                      + Add Products
                                    </button>
                                  ) : (
                                    <div className="border border-gray-200 rounded-lg bg-gray-50 p-3">
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                                          Select products to add
                                        </span>
                                        <div className="flex items-center gap-2">
                                          <button
                                            onClick={() =>
                                              toggleAllProducts(section)
                                            }
                                            className="text-xs text-blue-600 hover:text-blue-800"
                                          >
                                            {allProductsSelected(section)
                                              ? "Deselect All"
                                              : "Select All"}
                                          </button>
                                        </div>
                                      </div>
                                      <div className="max-h-48 overflow-y-auto space-y-1">
                                        {availableProductsForSection(
                                          section,
                                        ).map((p: any) => (
                                          <label
                                            key={p.stripe_id}
                                            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white cursor-pointer"
                                          >
                                            <input
                                              type="checkbox"
                                              checked={
                                                productPickerSelection[
                                                  section.id
                                                ]?.has(p.stripe_id) || false
                                              }
                                              onChange={() =>
                                                toggleProductSelection(
                                                  section.id,
                                                  p.stripe_id,
                                                )
                                              }
                                              className="rounded text-blue-600"
                                            />
                                            <span className="text-sm text-gray-800 flex-1">
                                              {p.name}
                                            </span>
                                            <span className="text-xs text-green-600 font-medium">
                                              {resolveProductPrice(
                                                p.stripe_id,
                                                section.section_type,
                                              )}
                                            </span>
                                          </label>
                                        ))}
                                      </div>
                                      <div className="mt-3 flex items-center gap-2">
                                        <button
                                          onClick={() =>
                                            handleAddSelectedProducts(
                                              section.id,
                                            )
                                          }
                                          disabled={
                                            !productPickerSelection[
                                              section.id
                                            ]?.size
                                          }
                                          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm py-1.5 px-3 rounded"
                                        >
                                          Add{" "}
                                          {productPickerSelection[
                                            section.id
                                          ]?.size || 0}{" "}
                                          Product
                                          {(productPickerSelection[
                                            section.id
                                          ]?.size || 0) === 1
                                            ? ""
                                            : "s"}
                                        </button>
                                        <button
                                          onClick={() =>
                                            setAddProductPickerOpen(
                                              (prev) => ({
                                                ...prev,
                                                [section.id]: false,
                                              }),
                                            )
                                          }
                                          className="text-sm text-gray-600 hover:text-gray-800 py-1.5 px-3"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </>
                              ) : filteredStripeProducts(
                                  section.section_type,
                                ).length === 0 ? (
                                <div className="text-sm text-gray-400 py-2">
                                  No{" "}
                                  {section.section_type.replace("_", " ")}{" "}
                                  products found in your pricebook. Import
                                  products from Stripe first.
                                </div>
                              ) : (
                                <div className="text-sm text-gray-400 py-2">
                                  All matching products already added.
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ===== Deal Terms Tab ===== */}
                {activeTab === "deal_terms" && (
                  <div className="space-y-6">
                    {/* Term Lengths */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">
                        Available Term Lengths
                      </h3>
                      <div className="flex flex-wrap gap-3">
                        {ALL_TERM_LENGTHS.map((opt) => (
                          <label
                            key={opt}
                            className="flex items-center gap-2"
                          >
                            <input
                              type="checkbox"
                              checked={editDealTerms.term_lengths.includes(
                                opt,
                              )}
                              onChange={() =>
                                setEditDealTerms((p) => ({
                                  ...p,
                                  term_lengths: toggleInArray(
                                    p.term_lengths,
                                    opt,
                                  ),
                                }))
                              }
                              className="rounded"
                            />
                            <span className="text-sm text-gray-700">
                              {formatTermLabel(opt)}
                            </span>
                          </label>
                        ))}
                      </div>
                      <div className="mt-2">
                        <label className="text-xs text-gray-500">
                          Default:
                        </label>
                        <select
                          value={editDealTerms.default_term_length}
                          onChange={(e) =>
                            setEditDealTerms((p) => ({
                              ...p,
                              default_term_length: e.target.value,
                            }))
                          }
                          className="ml-2 border border-gray-300 rounded px-2 py-1 text-sm"
                        >
                          {editDealTerms.term_lengths.map((opt) => (
                            <option key={opt} value={opt}>
                              {formatTermLabel(opt)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Billing Frequencies */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">
                        Available Billing Frequencies
                      </h3>
                      <div className="flex flex-wrap gap-3">
                        {ALL_BILLING_FREQUENCIES.map((opt) => (
                          <label
                            key={opt}
                            className="flex items-center gap-2"
                          >
                            <input
                              type="checkbox"
                              checked={editDealTerms.billing_frequencies.includes(
                                opt,
                              )}
                              onChange={() =>
                                setEditDealTerms((p) => ({
                                  ...p,
                                  billing_frequencies: toggleInArray(
                                    p.billing_frequencies,
                                    opt,
                                  ),
                                }))
                              }
                              className="rounded"
                            />
                            <span className="text-sm text-gray-700">
                              {capitalize(opt)}
                            </span>
                          </label>
                        ))}
                      </div>
                      <div className="mt-2">
                        <label className="text-xs text-gray-500">
                          Default:
                        </label>
                        <select
                          value={editDealTerms.default_billing_frequency}
                          onChange={(e) =>
                            setEditDealTerms((p) => ({
                              ...p,
                              default_billing_frequency: e.target.value,
                            }))
                          }
                          className="ml-2 border border-gray-300 rounded px-2 py-1 text-sm"
                        >
                          {editDealTerms.billing_frequencies.map((opt) => (
                            <option key={opt} value={opt}>
                              {capitalize(opt)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Payment Terms */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">
                        Available Payment Terms (Net days)
                      </h3>
                      <div className="flex flex-wrap gap-3">
                        {ALL_PAYMENT_TERMS.map((opt) => (
                          <label
                            key={opt}
                            className="flex items-center gap-2"
                          >
                            <input
                              type="checkbox"
                              checked={editDealTerms.payment_terms.includes(
                                opt,
                              )}
                              onChange={() =>
                                setEditDealTerms((p) => ({
                                  ...p,
                                  payment_terms: toggleInArray(
                                    p.payment_terms,
                                    opt,
                                  ),
                                }))
                              }
                              className="rounded"
                            />
                            <span className="text-sm text-gray-700">
                              Net {opt}
                            </span>
                          </label>
                        ))}
                      </div>
                      <div className="mt-2">
                        <label className="text-xs text-gray-500">
                          Default:
                        </label>
                        <select
                          value={editDealTerms.default_payment_terms}
                          onChange={(e) =>
                            setEditDealTerms((p) => ({
                              ...p,
                              default_payment_terms: Number(e.target.value),
                            }))
                          }
                          className="ml-2 border border-gray-300 rounded px-2 py-1 text-sm"
                        >
                          {editDealTerms.payment_terms.map((opt) => (
                            <option key={opt} value={opt}>
                              Net {opt}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <button
                      onClick={handleSaveDealTerms}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm"
                    >
                      Save Deal Terms
                    </button>
                  </div>
                )}

                {/* ===== Discounts Tab ===== */}
                {activeTab === "discounts" && (
                  <div className="space-y-6">
                    {/* Term Discounts */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">
                        Term Discounts
                      </h3>
                      <div className="grid grid-cols-5 gap-3">
                        {editDealTerms.term_lengths.map((term) => (
                          <div key={term}>
                            <label className="block text-xs text-gray-500 mb-1">
                              {formatTermLabel(term)}
                            </label>
                            <div className="flex items-center">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                value={
                                  (editDiscounts.term_discounts[term] || 0) *
                                  100
                                }
                                onChange={(e) =>
                                  setEditDiscounts((p) => ({
                                    ...p,
                                    term_discounts: {
                                      ...p.term_discounts,
                                      [term]:
                                        (parseFloat(e.target.value) || 0) /
                                        100,
                                    },
                                  }))
                                }
                                className="w-20 border border-gray-300 rounded px-2 py-1.5 text-sm"
                              />
                              <span className="ml-1 text-sm text-gray-500">
                                %
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Billing Discounts */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">
                        Billing Frequency Discounts
                      </h3>
                      <div className="grid grid-cols-3 gap-3">
                        {editDealTerms.billing_frequencies.map((freq) => (
                          <div key={freq}>
                            <label className="block text-xs text-gray-500 mb-1">
                              {capitalize(freq)}
                            </label>
                            <div className="flex items-center">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                value={
                                  (editDiscounts.billing_discounts[freq] ||
                                    0) * 100
                                }
                                onChange={(e) =>
                                  setEditDiscounts((p) => ({
                                    ...p,
                                    billing_discounts: {
                                      ...p.billing_discounts,
                                      [freq]:
                                        (parseFloat(e.target.value) || 0) /
                                        100,
                                    },
                                  }))
                                }
                                className="w-20 border border-gray-300 rounded px-2 py-1.5 text-sm"
                              />
                              <span className="ml-1 text-sm text-gray-500">
                                %
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Term Months Map */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">
                        Term Months Override (optional)
                      </h3>
                      <div className="grid grid-cols-5 gap-3">
                        {editDealTerms.term_lengths.map((term) => (
                          <div key={term}>
                            <label className="block text-xs text-gray-500 mb-1">
                              {formatTermLabel(term)}
                            </label>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={
                                editDiscounts.term_months_map[term] ?? ""
                              }
                              onChange={(e) =>
                                setEditDiscounts((p) => ({
                                  ...p,
                                  term_months_map: {
                                    ...p.term_months_map,
                                    [term]:
                                      parseInt(e.target.value) || undefined,
                                  },
                                }))
                              }
                              placeholder="auto"
                              className="w-20 border border-gray-300 rounded px-2 py-1.5 text-sm"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Additional Discount toggle */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">
                        Additional Discount
                      </h3>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={editDiscounts.allow_additional_discount}
                          onChange={(e) =>
                            setEditDiscounts((p) => ({
                              ...p,
                              allow_additional_discount: e.target.checked,
                            }))
                          }
                          className="rounded text-blue-600"
                        />
                        <span className="text-sm text-gray-700">
                          Allow reps to enter an additional discount % on
                          quotes
                        </span>
                      </label>
                      <p className="mt-1 text-xs text-gray-400">
                        When enabled, an "Additional Discount %" field appears
                        on the quote form and is added to term + billing
                        discounts.
                      </p>
                    </div>

                    <button
                      onClick={handleSaveDiscounts}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm"
                    >
                      Save Discounts
                    </button>
                  </div>
                )}

                {/* ===== Approvals Tab ===== */}
                {activeTab === "approvals" && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                        Approval Rules
                      </h3>
                      <button
                        onClick={addApprovalRule}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                      >
                        + Add Rule
                      </button>
                    </div>

                    {editApprovalRules.length === 0 ? (
                      <div className="text-sm text-gray-400 py-4">
                        No approval rules configured.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {editApprovalRules.map((rule: any, i: number) => (
                          <div
                            key={i}
                            className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg"
                          >
                            <div className="flex-1 grid grid-cols-4 gap-2">
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">
                                  Type
                                </label>
                                <select
                                  value={rule.type}
                                  onChange={(e) =>
                                    updateApprovalRule(
                                      i,
                                      "type",
                                      e.target.value,
                                    )
                                  }
                                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                                >
                                  <option value="paymentTermsNet">
                                    Payment Terms Net
                                  </option>
                                  <option value="totalDiscountPct">
                                    Total Discount %
                                  </option>
                                  <option value="mrr">MRR</option>
                                  <option value="tcv">TCV</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">
                                  Operator
                                </label>
                                <select
                                  value={rule.operator}
                                  onChange={(e) =>
                                    updateApprovalRule(
                                      i,
                                      "operator",
                                      e.target.value,
                                    )
                                  }
                                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                                >
                                  <option value=">=">{">="}</option>
                                  <option value=">">{">"}</option>
                                  <option value="<=">{"<="}</option>
                                  <option value="<">{"<"}</option>
                                  <option value="==">{"="}</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">
                                  Value
                                </label>
                                <input
                                  type="number"
                                  value={rule.value}
                                  onChange={(e) =>
                                    updateApprovalRule(
                                      i,
                                      "value",
                                      Number(e.target.value),
                                    )
                                  }
                                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">
                                  Message
                                </label>
                                <input
                                  type="text"
                                  value={rule.message}
                                  onChange={(e) =>
                                    updateApprovalRule(
                                      i,
                                      "message",
                                      e.target.value,
                                    )
                                  }
                                  placeholder="Requires approval..."
                                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                                />
                              </div>
                            </div>
                            <button
                              onClick={() => removeApprovalRule(i)}
                              className="mt-5 text-xs text-red-500 hover:text-red-700"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <button
                      onClick={handleSaveApprovalRules}
                      className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm"
                    >
                      Save Approval Rules
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
