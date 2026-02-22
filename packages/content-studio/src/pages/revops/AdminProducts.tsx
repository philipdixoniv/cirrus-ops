import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { useStripePricebook } from "@/hooks/revops/useStripePricebook";
import { useStripeInstances } from "@/contexts/StripeInstanceContext";
import { useOrg } from "@/contexts/OrgContext";

// ============================================================================
// Type helpers
// ============================================================================
interface NativeNewProduct {
  name: string;
  description: string;
  unit_label: string;
  type: string;
  active: boolean;
  statement_descriptor: string;
  url: string;
  tax_code: string;
  images: string;
  shippable: boolean;
  package_dimensions: { height: string | number; length: string | number; weight: string | number; width: string | number };
  marketing_features: { name: string }[];
  metadata: { key: string; value: string }[];
}

interface NewPrice {
  pricing_model: string;
  usage_sub_model: string;
  type: string;
  billing_period: string;
  custom_interval: string;
  custom_interval_count: number;
  amount: number | null;
  currency: string;
  usage_type: string;
  recurring_meter: string;
  package_size: number | null;
  package_round: string;
  tiers: { up_to: string | number; unit_amount: string | number; flat_amount: string | number }[];
  custom_unit_amount_preset: number | null;
  custom_unit_amount_minimum: number | null;
  custom_unit_amount_maximum: number | null;
  show_advanced: boolean;
  nickname: string;
  lookup_key: string;
  transfer_lookup_key: boolean;
  tax_behavior: string;
  currency_options: { currency: string; unit_amount: number | null }[];
  metadata: { key: string; value: string }[];
}

interface NewCoupon {
  custom_id: string;
  name: string;
  discount_type: string;
  percent_off: number | null;
  amount_off: number | null;
  currency: string;
  duration: string;
  duration_in_months: number | null;
  max_redemptions: number | null;
  redeem_by: string;
  applies_to_products: string[];
  currency_options: { currency: string; amount_off: number | null }[];
  metadata: { key: string; value: string }[];
}

// ============================================================================
// Default state factories
// ============================================================================
function makeDefaultProduct(): NativeNewProduct {
  return {
    name: "", description: "", unit_label: "",
    type: "service", active: true,
    statement_descriptor: "", url: "", tax_code: "",
    images: "",
    shippable: false,
    package_dimensions: { height: "", length: "", weight: "", width: "" },
    marketing_features: [{ name: "" }],
    metadata: [{ key: "product_key", value: "" }],
  };
}

function makeDefaultPrice(): NewPrice {
  return {
    pricing_model: "standard", usage_sub_model: "per_unit",
    type: "recurring", billing_period: "month:1",
    custom_interval: "month", custom_interval_count: 1,
    amount: null, currency: "usd",
    usage_type: "licensed", recurring_meter: "",
    package_size: null, package_round: "up",
    tiers: [{ up_to: "", unit_amount: "", flat_amount: "" }],
    custom_unit_amount_preset: null,
    custom_unit_amount_minimum: null,
    custom_unit_amount_maximum: null,
    show_advanced: false,
    nickname: "", lookup_key: "", transfer_lookup_key: false,
    tax_behavior: "unspecified",
    currency_options: [{ currency: "", unit_amount: null }],
    metadata: [{ key: "", value: "" }],
  };
}

function makeDefaultCoupon(): NewCoupon {
  return {
    custom_id: "", name: "",
    discount_type: "percent",
    percent_off: null, amount_off: null, currency: "usd",
    duration: "once", duration_in_months: null,
    max_redemptions: null, redeem_by: "",
    applies_to_products: [],
    currency_options: [{ currency: "", amount_off: null }],
    metadata: [{ key: "", value: "" }],
  };
}

// ============================================================================
// Main component
// ============================================================================
export default function AdminProducts() {
  const {
    stripeProducts: nativeProducts,
    stripePrices: nativePrices,
    stripeCoupons: nativeCoupons,
    loading: nativeLoading,
    error: nativeError,
    createProduct: nativeCreateProduct,
    updateProduct: nativeUpdateProduct,
    deactivateProduct: nativeDeactivate,
    createPrice: nativeCreatePrice,
    createCoupon: nativeCreateCoupon,
    deactivatePrice: nativeDeactivatePrice,
    importFromStripe: nativeImport,
    syncToStripe: nativeSync,
    syncSingleProduct: nativeSyncSingle,
    getProductLineage,
    refetch: loadPricebook,
  } = useStripePricebook();

  const {
    instances: instancesList,
    activeInstanceId,
    activeInstance: currentInstance,
    switchInstance,
  } = useStripeInstances();

  const { activeOrg } = useOrg();
  const orgName = activeOrg?.name || "Organization";

  // ── UI state ──
  const [activeTab, setActiveTab] = useState("products");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showCouponForm, setShowCouponForm] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [productLineageMap, setProductLineageMap] = useState<Record<string, any[]>>({});
  const [creatingProductAndPrice, setCreatingProductAndPrice] = useState(false);

  // ── Form state ──
  const [nativeNewProduct, setNativeNewProduct] = useState<NativeNewProduct>(makeDefaultProduct());
  const [newPrice, setNewPrice] = useState<NewPrice>(makeDefaultPrice());
  const [newCoupon, setNewCoupon] = useState<NewCoupon>(makeDefaultCoupon());
  const [cloneSourceProduct, setCloneSourceProduct] = useState<any>(null);
  const [cloneSourceSnapshot, setCloneSourceSnapshot] = useState<string | null>(null);

  const currentError = nativeError;

  const tabs = useMemo(
    () => [
      { id: "products", label: "Products", count: nativeProducts.length },
      { id: "prices", label: "Prices", count: nativePrices.length },
      { id: "coupons", label: "Coupons", count: nativeCoupons.length },
    ],
    [nativeProducts.length, nativePrices.length, nativeCoupons.length],
  );

  // ── Computed ──
  const pricesByProduct = useMemo(() => {
    const groups: { product: any; prices: any[] }[] = [];
    for (const product of nativeProducts) {
      const prices = nativePrices.filter((p: any) => p.product_stripe_id === product.stripe_id);
      if (prices.length > 0) groups.push({ product, prices });
    }
    return groups;
  }, [nativeProducts, nativePrices]);

  const hasCloneChanges = useMemo(() => {
    if (!cloneSourceProduct) return true;
    if (!cloneSourceSnapshot) return true;
    const currentState = JSON.stringify({ product: nativeNewProduct, price: newPrice });
    return currentState !== cloneSourceSnapshot;
  }, [cloneSourceProduct, cloneSourceSnapshot, nativeNewProduct, newPrice]);

  // ── Format helpers ──
  function formatPriceInterval(price: any) {
    if (price.type === "one_time") return "One-time";
    const interval = price.recurring_interval;
    const count = price.recurring_interval_count || 1;
    if (interval === "month" && count === 1) return "Monthly";
    if (interval === "month" && count === 3) return "Every 3 months";
    if (interval === "month" && count === 6) return "Every 6 months";
    if (interval === "year" && count === 1) return "Annual";
    if (interval === "week" && count === 1) return "Weekly";
    if (interval === "day" && count === 1) return "Daily";
    return `Every ${count} ${interval}${count > 1 ? "s" : ""}`;
  }

  function formatPriceAmount(price: any) {
    if (price.billing_scheme === "tiered" && price.tiers) return `Tiered (${price.tiers.length} tiers)`;
    if (price.unit_amount != null) return `$${(price.unit_amount / 100).toFixed(2)}`;
    return "$0.00";
  }

  function formatCouponDiscount(coupon: any) {
    if (coupon.percent_off != null) return `${coupon.percent_off}% off`;
    if (coupon.amount_off != null) return `$${(coupon.amount_off / 100).toFixed(2)} off`;
    return "--";
  }

  function formatCouponDuration(coupon: any) {
    if (coupon.duration === "once") return "Once";
    if (coupon.duration === "forever") return "Forever";
    if (coupon.duration === "repeating") return `Repeating (${coupon.duration_in_months} months)`;
    return coupon.duration || "--";
  }

  function getCouponProductCount(coupon: any) {
    if (!coupon.applies_to?.products?.length) return "All products";
    return `${coupon.applies_to.products.length} product${coupon.applies_to.products.length === 1 ? "" : "s"}`;
  }

  function getProductPriceCount(product: any) {
    return nativePrices.filter((p: any) => p.product_stripe_id === product.stripe_id).length;
  }

  // ── Lineage ──
  async function loadProductLineage() {
    const map: Record<string, any[]> = {};
    for (const p of nativeProducts) {
      const lineage = getProductLineage(p.stripe_id);
      if (lineage && Array.isArray(lineage) && lineage.length > 0) {
        map[p.stripe_id] = (lineage as any[]).map((l: any) => {
          const isSource = l.source_stripe_id === p.stripe_id;
          const instanceName = isSource
            ? (l.target_instance?.name || "Unknown")
            : (l.source_instance?.name || "Unknown");
          return {
            id: l.id,
            label: isSource ? `Pushed to ${instanceName}` : `From ${instanceName}`,
            detail: `${isSource ? "Pushed" : "Imported"} ${new Date(l.pushed_at).toLocaleDateString()}`,
          };
        });
      }
    }
    setProductLineageMap(map);
  }

  // ── Effects ──
  useEffect(() => {
    if (nativeProducts.length > 0) {
      loadProductLineage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativeProducts.length, activeInstanceId]);

  // ── Instance change ──
  function handleInstanceChange(instanceId: string) {
    switchInstance(instanceId);
  }

  // ── Edit ──
  function startEdit(product: any) {
    setEditingId(product.id);
    setEditData({
      name: product.name,
      description: product.description || "",
      unit_label: product.unit_label || "",
      statement_descriptor: product.statement_descriptor || "",
      url: product.url || "",
      tax_code: product.tax_code || "",
      active: product.active,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditData({});
  }

  async function handleSaveEdit(product: any) {
    await nativeUpdateProduct(product.id, editData);
    setEditingId(null);
    setEditData({});
  }

  // ── Reset forms ──
  function resetNewPrice() {
    setNewPrice(makeDefaultPrice());
  }

  function resetNewCoupon() {
    setNewCoupon(makeDefaultCoupon());
  }

  function resetNativeForm() {
    setNativeNewProduct(makeDefaultProduct());
    resetNewPrice();
    setCloneSourceProduct(null);
    setCloneSourceSnapshot(null);
  }

  function cancelCreate() {
    setShowCreateForm(false);
    resetNativeForm();
  }

  // ── Clone ──
  function prefillPriceFromExisting(price: any) {
    if (!price) return;
    let pricingModel = "standard";
    let usageSubModel = "per_unit";

    if (price.custom_unit_amount) {
      pricingModel = "customer_chooses";
    } else if (price.billing_scheme === "tiered") {
      const isUsageBased = price.recurring_usage_type === "metered";
      if (isUsageBased) {
        pricingModel = "usage_based";
        usageSubModel = price.tiers_mode === "graduated" ? "graduated" : "volume";
      } else {
        pricingModel = price.tiers_mode === "graduated" ? "graduated" : "volume";
      }
    } else if (price.transform_quantity) {
      const isUsageBased = price.recurring_usage_type === "metered";
      if (isUsageBased) {
        pricingModel = "usage_based";
        usageSubModel = "package";
      } else {
        pricingModel = "package";
      }
    } else if (price.recurring_usage_type === "metered") {
      pricingModel = "usage_based";
      usageSubModel = "per_unit";
    }

    let billingPeriod = "month:1";
    if (price.type === "recurring" && price.recurring_interval) {
      const key = `${price.recurring_interval}:${price.recurring_interval_count || 1}`;
      const knownPeriods = ["day:1", "week:1", "month:1", "month:3", "month:6", "year:1"];
      billingPeriod = knownPeriods.includes(key) ? key : "custom";
    }

    let tiers: any[] = [{ up_to: "", unit_amount: "", flat_amount: "" }];
    if (price.tiers && Array.isArray(price.tiers) && price.tiers.length > 0) {
      tiers = price.tiers.map((t: any) => ({
        up_to: t.up_to === null ? "" : t.up_to,
        unit_amount: t.unit_amount != null ? t.unit_amount / 100 : "",
        flat_amount: t.flat_amount != null ? t.flat_amount / 100 : "",
      }));
    }

    const metadataArr =
      price.metadata && Object.keys(price.metadata).length > 0
        ? Object.entries(price.metadata).map(([key, value]) => ({ key, value: String(value) }))
        : [{ key: "", value: "" }];

    const currencyOptsArr =
      price.currency_options && Object.keys(price.currency_options).length > 0
        ? Object.entries(price.currency_options).map(([currency, opts]: [string, any]) => ({
            currency,
            unit_amount: opts.unit_amount != null ? opts.unit_amount / 100 : null,
          }))
        : [{ currency: "", unit_amount: null }];

    setNewPrice({
      pricing_model: pricingModel,
      usage_sub_model: usageSubModel,
      type: price.type || "recurring",
      billing_period: billingPeriod,
      custom_interval: billingPeriod === "custom" ? (price.recurring_interval || "month") : "month",
      custom_interval_count: billingPeriod === "custom" ? (price.recurring_interval_count || 1) : 1,
      amount: price.unit_amount != null ? price.unit_amount / 100 : null,
      currency: price.currency || "usd",
      usage_type: price.recurring_usage_type || "licensed",
      recurring_meter: price.recurring_meter || "",
      package_size: price.transform_quantity?.divide_by || null,
      package_round: price.transform_quantity?.round || "up",
      tiers,
      custom_unit_amount_preset: price.custom_unit_amount?.preset != null ? price.custom_unit_amount.preset / 100 : null,
      custom_unit_amount_minimum: price.custom_unit_amount?.minimum != null ? price.custom_unit_amount.minimum / 100 : null,
      custom_unit_amount_maximum: price.custom_unit_amount?.maximum != null ? price.custom_unit_amount.maximum / 100 : null,
      show_advanced: false,
      nickname: price.nickname || "",
      lookup_key: price.lookup_key || "",
      transfer_lookup_key: false,
      tax_behavior: price.tax_behavior || "unspecified",
      currency_options: currencyOptsArr,
      metadata: metadataArr,
    });
  }

  function startClone(product: any) {
    const metadataArr =
      product.metadata && Object.keys(product.metadata).length > 0
        ? Object.entries(product.metadata).map(([key, value]) => ({ key, value: String(value) }))
        : [{ key: "product_key", value: "" }];
    const marketingFeatures =
      product.marketing_features && product.marketing_features.length > 0
        ? product.marketing_features.map((f: any) => ({ name: f.name || "" }))
        : [{ name: "" }];
    const images = Array.isArray(product.images) ? product.images.join(", ") : "";

    const newProd: NativeNewProduct = {
      name: product.name || "",
      description: product.description || "",
      unit_label: product.unit_label || "",
      type: product.type || "service",
      active: product.active !== false,
      statement_descriptor: product.statement_descriptor || "",
      url: product.url || "",
      tax_code: product.tax_code || "",
      images,
      shippable: product.shippable || false,
      package_dimensions: product.package_dimensions
        ? { ...product.package_dimensions }
        : { height: "", length: "", weight: "", width: "" },
      marketing_features: marketingFeatures,
      metadata: metadataArr,
    };
    setNativeNewProduct(newProd);

    const prices = nativePrices.filter((p: any) => p.product_stripe_id === product.stripe_id && p.active);
    if (prices.length > 0) prefillPriceFromExisting(prices[0]);
    else resetNewPrice();

    setCloneSourceProduct(product);

    // Take snapshot for change detection -- must happen after state is set
    setTimeout(() => {
      setCloneSourceSnapshot(JSON.stringify({ product: newProd, price: newPrice }));
    }, 0);

    setShowCreateForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ── Create product + price ──
  async function createPriceFromForm(productStripeId: string) {
    const p = newPrice;
    const metadata: Record<string, string> = {};
    for (const row of p.metadata) {
      if (row.key.trim()) metadata[row.key.trim()] = row.value;
    }

    const model = p.pricing_model;
    const effectiveModel = model === "usage_based" ? p.usage_sub_model : model;
    const isTiered = effectiveModel === "graduated" || effectiveModel === "volume";
    const billingScheme = isTiered ? "tiered" : "per_unit";
    const tiersMode = effectiveModel === "graduated" ? "graduated" : effectiveModel === "volume" ? "volume" : null;

    const priceData: any = {
      product_stripe_id: productStripeId,
      type: p.type,
      currency: p.currency,
      billing_scheme: billingScheme,
      nickname: p.nickname || null,
      tax_behavior: p.tax_behavior === "unspecified" ? null : p.tax_behavior,
      lookup_key: p.lookup_key || null,
      transfer_lookup_key: p.lookup_key ? p.transfer_lookup_key : undefined,
      metadata: Object.keys(metadata).length > 0 ? metadata : {},
    };

    if (p.type === "recurring") {
      let interval: string, intervalCount: number;
      if (p.billing_period === "custom") {
        interval = p.custom_interval;
        intervalCount = Number(p.custom_interval_count) || 1;
      } else {
        const parts = p.billing_period.split(":");
        interval = parts[0];
        intervalCount = Number(parts[1]) || 1;
      }
      priceData.recurring_interval = interval;
      priceData.recurring_interval_count = intervalCount;

      if (model === "usage_based") {
        priceData.recurring_usage_type = "metered";
        priceData.recurring_meter = p.recurring_meter || null;
      } else {
        priceData.recurring_usage_type = p.usage_type;
        if (p.usage_type === "metered") priceData.recurring_meter = p.recurring_meter || null;
      }
    }

    if (isTiered) {
      priceData.tiers_mode = tiersMode;
      priceData.tiers = p.tiers.map((tier, i) => {
        const isLast = i === p.tiers.length - 1;
        return {
          up_to: isLast && !tier.up_to ? null : Number(tier.up_to),
          unit_amount: tier.unit_amount ? Math.round(Number(tier.unit_amount) * 100) : 0,
          flat_amount: tier.flat_amount ? Math.round(Number(tier.flat_amount) * 100) : 0,
        };
      });
      priceData.unit_amount = null;
    } else if (effectiveModel === "customer_chooses") {
      priceData.unit_amount = null;
      priceData.custom_unit_amount = {
        enabled: true,
        preset: p.custom_unit_amount_preset ? Math.round(Number(p.custom_unit_amount_preset) * 100) : undefined,
        minimum: p.custom_unit_amount_minimum ? Math.round(Number(p.custom_unit_amount_minimum) * 100) : undefined,
        maximum: p.custom_unit_amount_maximum ? Math.round(Number(p.custom_unit_amount_maximum) * 100) : undefined,
      };
    } else if (effectiveModel === "package") {
      priceData.unit_amount = p.amount ? Math.round(Number(p.amount) * 100) : 0;
      if (p.package_size && p.package_size > 1) {
        priceData.transform_quantity = { divide_by: Number(p.package_size), round: p.package_round || "up" };
      }
    } else {
      priceData.unit_amount = p.amount ? Math.round(Number(p.amount) * 100) : 0;
    }

    const currencyOpts: Record<string, any> = {};
    for (const opt of p.currency_options) {
      if (opt.currency && opt.unit_amount != null) {
        currencyOpts[opt.currency] = { unit_amount: Math.round(Number(opt.unit_amount) * 100) };
      }
    }
    if (Object.keys(currencyOpts).length > 0) priceData.currency_options = currencyOpts;

    return await nativeCreatePrice(priceData);
  }

  async function handleCreate() {
    setCreatingProductAndPrice(true);
    try {
      const metadata: Record<string, string> = {};
      for (const row of nativeNewProduct.metadata) {
        if (row.key.trim()) metadata[row.key.trim()] = row.value;
      }
      const images = nativeNewProduct.images
        ? nativeNewProduct.images.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
      const marketing_features = nativeNewProduct.marketing_features
        .filter((f) => f.name.trim())
        .map((f) => ({ name: f.name.trim() }));
      const dims = nativeNewProduct.package_dimensions;
      const package_dimensions =
        nativeNewProduct.shippable && dims.height && dims.length && dims.weight && dims.width
          ? { height: Number(dims.height), length: Number(dims.length), weight: Number(dims.weight), width: Number(dims.width) }
          : null;

      const product = await nativeCreateProduct({
        name: nativeNewProduct.name,
        description: nativeNewProduct.description || null,
        unit_label: nativeNewProduct.unit_label || null,
        type: nativeNewProduct.type || "service",
        active: nativeNewProduct.active,
        statement_descriptor: nativeNewProduct.statement_descriptor || null,
        url: nativeNewProduct.url || null,
        tax_code: nativeNewProduct.tax_code || null,
        images,
        marketing_features,
        shippable: nativeNewProduct.type === "good" ? nativeNewProduct.shippable : null,
        package_dimensions,
        metadata,
      });

      if (!product) return;

      await createPriceFromForm(product.stripe_id);
      setShowCreateForm(false);
      resetNativeForm();
    } finally {
      setCreatingProductAndPrice(false);
    }
  }

  // ── Create coupon ──
  async function handleCreateCoupon() {
    const c = newCoupon;
    const metadata: Record<string, string> = {};
    for (const row of c.metadata) {
      if (row.key.trim()) metadata[row.key.trim()] = row.value;
    }
    const couponData: any = {
      name: c.name || null,
      duration: c.duration,
      metadata: Object.keys(metadata).length > 0 ? metadata : {},
    };
    if (c.custom_id?.trim()) couponData.stripe_id = c.custom_id.trim();
    if (c.discount_type === "percent") {
      couponData.percent_off = Number(c.percent_off);
    } else {
      couponData.amount_off = Math.round(Number(c.amount_off) * 100);
      couponData.currency = c.currency;
      const currencyOpts: Record<string, any> = {};
      for (const opt of c.currency_options) {
        if (opt.currency && opt.amount_off) {
          currencyOpts[opt.currency] = { amount_off: Math.round(Number(opt.amount_off) * 100) };
        }
      }
      if (Object.keys(currencyOpts).length > 0) couponData.currency_options = currencyOpts;
    }
    if (c.duration === "repeating") couponData.duration_in_months = Number(c.duration_in_months);
    if (c.max_redemptions) couponData.max_redemptions = Number(c.max_redemptions);
    if (c.redeem_by) couponData.redeem_by = Math.floor(new Date(c.redeem_by).getTime() / 1000);
    if (c.applies_to_products.length > 0) couponData.applies_to = { products: c.applies_to_products };

    await nativeCreateCoupon(couponData);
    setShowCouponForm(false);
    resetNewCoupon();
  }

  // ── Actions ──
  async function handleDelete(id: string) {
    await nativeDeactivate(id);
  }

  async function handleSyncOne(productId: string) {
    await nativeSyncSingle(productId);
  }

  async function handleSyncAll() {
    await nativeSync();
  }

  function handleImportFromStripe() {
    setShowImportConfirm(true);
  }

  async function confirmImport() {
    setShowImportConfirm(false);
    const result = await nativeImport();
    if (result) setImportResult(result);
  }

  // ── Helper to update nested product form fields ──
  function updateProduct(updates: Partial<NativeNewProduct>) {
    setNativeNewProduct((prev) => ({ ...prev, ...updates }));
  }

  function updatePrice(updates: Partial<NewPrice>) {
    setNewPrice((prev) => ({ ...prev, ...updates }));
  }

  function updateCoupon(updates: Partial<NewCoupon>) {
    setNewCoupon((prev) => ({ ...prev, ...updates }));
  }

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold text-gray-900">Price Book</h2>
            {instancesList.length > 0 ? (
              <select
                value={activeInstanceId || ""}
                onChange={(e) => handleInstanceChange(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1 text-xs font-medium text-gray-700"
              >
                {instancesList.map((inst: any) => (
                  <option key={inst.id} value={inst.id}>{inst.name}</option>
                ))}
              </select>
            ) : (
              <span className="text-xs text-gray-400 italic">No instances configured</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowCreateForm(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm">
              + Add Product
            </button>
            <button onClick={() => setShowCouponForm(true)} className="bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-lg text-sm">
              + Add Coupon
            </button>
            <button onClick={handleImportFromStripe} disabled={nativeLoading} className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg text-sm">
              {nativeLoading ? "Importing..." : "Import from Stripe"}
            </button>
            <button onClick={handleSyncAll} disabled={nativeLoading} className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg text-sm">
              {nativeLoading ? "Syncing..." : "Sync All"}
            </button>
            <Link to="/revops/admin/stripe-sync" className="text-gray-500 hover:text-gray-700 text-sm font-medium py-2 px-3">
              Sync Log
            </Link>
            <Link to="/revops/admin/stripe-compare" className="text-purple-600 hover:text-purple-800 text-sm font-medium py-2 px-3">
              Compare & Sync
            </Link>
          </div>
        </div>

        {/* Stripe Connection Info Bar */}
        {currentInstance && (
          <div className="bg-gray-100 border-b border-gray-200">
            <div className="max-w-6xl mx-auto px-4 py-2 sm:px-6 lg:px-8 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sm">
                <span className="font-medium text-gray-900">{orgName}</span>
                <span className="text-gray-300">/</span>
                <span className="font-medium text-gray-700">{currentInstance.name}</span>
                {currentInstance.stripe_account_id && (
                  <>
                    <span className="text-gray-300">/</span>
                    <span className="font-mono text-xs text-gray-500">{currentInstance.stripe_account_id}</span>
                  </>
                )}
              </div>
              <div className="text-xs text-gray-400">
                Last synced: {currentInstance.last_sync_at ? new Date(currentInstance.last_sync_at).toLocaleString() : "Never"}
              </div>
            </div>
          </div>
        )}

        {/* Status messages */}
        {currentError && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{currentError}</div>}
        {importResult && (
          <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm">
            Imported {importResult.imported_products} products, {importResult.imported_prices} prices, {importResult.imported_coupons} coupons from Stripe.
            <button onClick={() => setImportResult(null)} className="ml-2 underline">dismiss</button>
          </div>
        )}

        {/* Create Product Form */}
        {showCreateForm && (
          <CreateProductForm
            nativeNewProduct={nativeNewProduct}
            updateProduct={updateProduct}
            setNativeNewProduct={setNativeNewProduct}
            newPrice={newPrice}
            updatePrice={updatePrice}
            setNewPrice={setNewPrice}
            cloneSourceProduct={cloneSourceProduct}
            hasCloneChanges={hasCloneChanges}
            creatingProductAndPrice={creatingProductAndPrice}
            handleCreate={handleCreate}
            cancelCreate={cancelCreate}
          />
        )}

        {/* Create Coupon Form */}
        {showCouponForm && (
          <CreateCouponForm
            newCoupon={newCoupon}
            updateCoupon={updateCoupon}
            setNewCoupon={setNewCoupon}
            nativeProducts={nativeProducts}
            handleCreateCoupon={handleCreateCoupon}
            onCancel={() => setShowCouponForm(false)}
          />
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 text-sm font-medium border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </nav>
        </div>

        {/* Products Tab */}
        {activeTab === "products" && (
          <ProductsSection
            products={nativeProducts}
            editingId={editingId}
            editData={editData}
            setEditData={setEditData}
            startEdit={startEdit}
            cancelEdit={cancelEdit}
            handleSaveEdit={handleSaveEdit}
            startClone={startClone}
            handleSyncOne={handleSyncOne}
            handleDelete={handleDelete}
            nativeLoading={nativeLoading}
            getProductPriceCount={getProductPriceCount}
            productLineageMap={productLineageMap}
          />
        )}

        {/* Prices Tab */}
        {activeTab === "prices" && (
          <PricesSection
            pricesByProduct={pricesByProduct}
            formatPriceInterval={formatPriceInterval}
            formatPriceAmount={formatPriceAmount}
            nativeDeactivatePrice={nativeDeactivatePrice}
          />
        )}

        {/* Coupons Tab */}
        {activeTab === "coupons" && (
          <CouponsSection
            coupons={nativeCoupons}
            formatCouponDiscount={formatCouponDiscount}
            formatCouponDuration={formatCouponDuration}
            getCouponProductCount={getCouponProductCount}
          />
        )}

        {/* Import Confirmation Modal */}
        {showImportConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Import from Stripe</h3>
              <p className="text-sm text-gray-600 mb-4">
                This will fetch all products, prices, and coupons from your Stripe instance{" "}
                <strong>{currentInstance?.name || ""}</strong> and import them into the Stripe-native price book tables.
              </p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowImportConfirm(false)} className="text-gray-500 hover:text-gray-700 text-sm font-medium py-1.5 px-4">
                  Cancel
                </button>
                <button onClick={confirmImport} className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium py-1.5 px-4 rounded-lg">
                  Import
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// ProductsSection sub-component
// ============================================================================
function ProductsSection({
  products,
  editingId,
  editData,
  setEditData,
  startEdit,
  cancelEdit,
  handleSaveEdit,
  startClone,
  handleSyncOne,
  handleDelete,
  nativeLoading,
  getProductPriceCount,
  productLineageMap,
}: any) {
  return (
    <div className="bg-white rounded-lg shadow">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-3 px-4 font-medium text-gray-500">Name</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Stripe ID</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Unit Label</th>
            <th className="text-center py-3 px-4 font-medium text-gray-500">Prices</th>
            <th className="text-center py-3 px-4 font-medium text-gray-500">Active</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Lineage</th>
            <th className="text-right py-3 px-4 font-medium text-gray-500">Actions</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p: any) => (
            <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-3 px-4" colSpan={editingId === p.id ? 3 : 1}>
                {editingId === p.id ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-400 mb-0.5">Name</label>
                        <input
                          value={editData.name}
                          onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                          className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-0.5">Unit Label</label>
                        <input
                          value={editData.unit_label}
                          onChange={(e) => setEditData({ ...editData, unit_label: e.target.value })}
                          className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
                          maxLength={12}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-0.5">Description</label>
                      <input
                        value={editData.description}
                        onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                        className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
                        placeholder="Description"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs text-gray-400 mb-0.5">Statement Descriptor</label>
                        <input
                          value={editData.statement_descriptor}
                          onChange={(e) => setEditData({ ...editData, statement_descriptor: e.target.value })}
                          className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
                          maxLength={22}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-0.5">URL</label>
                        <input
                          value={editData.url}
                          onChange={(e) => setEditData({ ...editData, url: e.target.value })}
                          className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-0.5">Tax Code</label>
                        <input
                          value={editData.tax_code}
                          onChange={(e) => setEditData({ ...editData, tax_code: e.target.value })}
                          className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
                        />
                      </div>
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-gray-500">
                      <input
                        type="checkbox"
                        checked={editData.active}
                        onChange={(e) => setEditData({ ...editData, active: e.target.checked })}
                        className="rounded border-gray-300"
                      />
                      Active
                    </label>
                  </div>
                ) : (
                  <>
                    <span className="text-gray-900">{p.name}</span>
                    {p.description && <p className="text-xs text-gray-400 mt-0.5">{p.description}</p>}
                  </>
                )}
              </td>
              {editingId !== p.id && (
                <>
                  <td className="py-3 px-4 text-gray-500 font-mono text-xs">{p.stripe_id}</td>
                  <td className="py-3 px-4 text-gray-500 text-xs">{p.unit_label || "--"}</td>
                </>
              )}
              <td className="py-3 px-4 text-center">
                <span className="text-xs text-gray-500">
                  {getProductPriceCount(p)} price{getProductPriceCount(p) !== 1 ? "s" : ""}
                </span>
              </td>
              <td className="py-3 px-4 text-center">
                {p.active ? (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800">active</span>
                ) : (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-500">inactive</span>
                )}
              </td>
              <td className="py-3 px-4">
                {productLineageMap[p.stripe_id] ? (
                  <div className="flex flex-wrap gap-1">
                    {productLineageMap[p.stripe_id].map((badge: any) => (
                      <span
                        key={badge.id}
                        className="px-1.5 py-0.5 text-xs rounded bg-indigo-50 text-indigo-700"
                        title={badge.detail}
                      >
                        {badge.label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-gray-300 text-xs">--</span>
                )}
              </td>
              <td className="py-3 px-4 text-right space-x-2">
                {editingId === p.id ? (
                  <>
                    <button onClick={() => handleSaveEdit(p)} className="text-green-600 hover:text-green-800 text-xs font-medium">Save</button>
                    <button onClick={cancelEdit} className="text-gray-500 hover:text-gray-700 text-xs font-medium">Cancel</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => startClone(p)} className="text-purple-600 hover:text-purple-800 text-xs font-medium">Clone</button>
                    <button onClick={() => startEdit(p)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Edit</button>
                    <button onClick={() => handleSyncOne(p.id)} disabled={nativeLoading} className="text-green-600 hover:text-green-800 text-xs font-medium">Sync</button>
                    <button onClick={() => handleDelete(p.id)} className="text-red-600 hover:text-red-800 text-xs font-medium">Deactivate</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {products.length === 0 && (
        <div className="p-6 text-center text-gray-500 text-sm">No products yet. Import from Stripe to get started.</div>
      )}
    </div>
  );
}

// ============================================================================
// PricesSection sub-component
// ============================================================================
function PricesSection({ pricesByProduct, formatPriceInterval, formatPriceAmount, nativeDeactivatePrice }: any) {
  return (
    <div className="space-y-4">
      {pricesByProduct.map((group: any) => (
        <div key={group.product.id} className="bg-white rounded-lg shadow">
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-medium text-gray-900">{group.product.name}</h3>
            <p className="text-xs text-gray-500 font-mono">{group.product.stripe_id}</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-4 font-medium text-gray-500">Stripe Price ID</th>
                <th className="text-left py-2 px-4 font-medium text-gray-500">Type</th>
                <th className="text-left py-2 px-4 font-medium text-gray-500">Interval</th>
                <th className="text-right py-2 px-4 font-medium text-gray-500">Amount</th>
                <th className="text-center py-2 px-4 font-medium text-gray-500">Active</th>
                <th className="text-right py-2 px-4 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {group.prices.map((price: any) => (
                <tr key={price.id} className="border-b border-gray-100">
                  <td className="py-2 px-4 text-gray-500 font-mono text-xs">{price.stripe_id}</td>
                  <td className="py-2 px-4 text-gray-900 text-xs">{price.billing_scheme === "tiered" ? "Tiered" : "Per unit"}</td>
                  <td className="py-2 px-4 text-gray-900 text-xs">{formatPriceInterval(price)}</td>
                  <td className="py-2 px-4 text-right text-gray-900">{formatPriceAmount(price)}</td>
                  <td className="py-2 px-4 text-center">
                    {price.active ? (
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800">active</span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-500">inactive</span>
                    )}
                  </td>
                  <td className="py-2 px-4 text-right">
                    <button onClick={() => nativeDeactivatePrice(price.id)} className="text-red-600 hover:text-red-800 text-xs font-medium">
                      Deactivate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {pricesByProduct.length === 0 && (
        <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500 text-sm">
          No prices yet. Import from Stripe to get started.
        </div>
      )}
    </div>
  );
}

// ============================================================================
// CouponsSection sub-component
// ============================================================================
function CouponsSection({ coupons, formatCouponDiscount, formatCouponDuration, getCouponProductCount }: any) {
  return (
    <div className="bg-white rounded-lg shadow">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-3 px-4 font-medium text-gray-500">Name</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Stripe ID</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Discount</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Duration</th>
            <th className="text-center py-3 px-4 font-medium text-gray-500">Valid</th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">Applies To</th>
          </tr>
        </thead>
        <tbody>
          {coupons.map((c: any) => (
            <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-3 px-4 text-gray-900">{c.name || c.stripe_id}</td>
              <td className="py-3 px-4 text-gray-500 font-mono text-xs">{c.stripe_id}</td>
              <td className="py-3 px-4 text-gray-900">{formatCouponDiscount(c)}</td>
              <td className="py-3 px-4 text-gray-500">{formatCouponDuration(c)}</td>
              <td className="py-3 px-4 text-center">
                {c.valid ? (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800">valid</span>
                ) : (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-500">expired</span>
                )}
              </td>
              <td className="py-3 px-4 text-gray-500 text-xs">{getCouponProductCount(c)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {coupons.length === 0 && (
        <div className="p-6 text-center text-gray-500 text-sm">No coupons yet. Import from Stripe to get started.</div>
      )}
    </div>
  );
}

// ============================================================================
// CreateProductForm sub-component
// ============================================================================
function CreateProductForm({
  nativeNewProduct,
  updateProduct,
  setNativeNewProduct,
  newPrice,
  updatePrice,
  setNewPrice,
  cloneSourceProduct,
  hasCloneChanges,
  creatingProductAndPrice,
  handleCreate,
  cancelCreate,
}: any) {
  const p = nativeNewProduct as NativeNewProduct;
  const price = newPrice as NewPrice;

  const pricingModels = [
    { value: "standard", label: "Standard", desc: "Flat rate per unit" },
    { value: "package", label: "Package", desc: "Charge per bundle of N units" },
    { value: "graduated", label: "Graduated", desc: "Tiered pricing, each tier priced separately" },
    { value: "volume", label: "Volume", desc: "Tiered pricing, all units at one tier" },
    { value: "customer_chooses", label: "Customer chooses", desc: "Pay-what-you-want with optional limits" },
    { value: "usage_based", label: "Usage-based", desc: "Metered via Billing Meters" },
  ];

  const usageSubModels = [
    { value: "per_unit", label: "Per unit" },
    { value: "package", label: "Per package" },
    { value: "graduated", label: "Per tier (graduated)" },
    { value: "volume", label: "Per tier (volume)" },
  ];

  const showTiers =
    price.pricing_model === "graduated" ||
    price.pricing_model === "volume" ||
    (price.pricing_model === "usage_based" && (price.usage_sub_model === "graduated" || price.usage_sub_model === "volume"));

  const showStandard =
    price.pricing_model === "standard" || (price.pricing_model === "usage_based" && price.usage_sub_model === "per_unit");

  const showPackage =
    price.pricing_model === "package" || (price.pricing_model === "usage_based" && price.usage_sub_model === "package");

  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-5">
      <h2 className="text-lg font-semibold text-gray-900">
        {cloneSourceProduct ? "Clone Product + Price" : "New Product + Price"}
      </h2>
      {cloneSourceProduct && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <span className="font-medium">Cloning from:</span> {cloneSourceProduct.name}{" "}
          <span className="font-mono text-xs text-amber-600">({cloneSourceProduct.stripe_id})</span>
        </div>
      )}

      {/* Required */}
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Name <span className="text-red-500">*</span></label>
            <input value={p.name} onChange={(e) => updateProduct({ name: e.target.value })} type="text" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="Product name" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
            <select value={p.type} onChange={(e) => updateProduct({ type: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
              <option value="service">Service</option>
              <option value="good">Good</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
          <textarea value={p.description} onChange={(e) => updateProduct({ description: e.target.value })} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="Customer-facing description" />
        </div>
        <div className="flex items-center gap-2">
          <input checked={p.active} onChange={(e) => updateProduct({ active: e.target.checked })} type="checkbox" id="product-active" className="rounded border-gray-300" />
          <label htmlFor="product-active" className="text-xs font-medium text-gray-500">Active</label>
        </div>
      </div>

      {/* Pricing & Billing */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Pricing & Billing</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Unit Label <span className="text-gray-400">(max 12 chars)</span></label>
            <input value={p.unit_label} onChange={(e) => updateProduct({ unit_label: e.target.value })} type="text" maxLength={12} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="e.g. seat, user, hour, GB" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Statement Descriptor <span className="text-gray-400">(max 22 chars)</span></label>
            <input value={p.statement_descriptor} onChange={(e) => updateProduct({ statement_descriptor: e.target.value })} type="text" maxLength={22} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="e.g. CIRRUSPATH PLATFORM" />
          </div>
        </div>
      </div>

      {/* Additional Details */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Additional Details</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Product URL</label>
            <input value={p.url} onChange={(e) => updateProduct({ url: e.target.value })} type="text" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="https://..." />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tax Code</label>
            <input value={p.tax_code} onChange={(e) => updateProduct({ tax_code: e.target.value })} type="text" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="e.g. txcd_10000000" />
          </div>
        </div>
        <div className="mt-3">
          <label className="block text-xs font-medium text-gray-500 mb-1">Images <span className="text-gray-400">(comma-separated URLs, max 8)</span></label>
          <input value={p.images} onChange={(e) => updateProduct({ images: e.target.value })} type="text" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="https://example.com/img1.png, https://example.com/img2.png" />
        </div>
      </div>

      {/* Shipping */}
      {p.type === "good" && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Shipping</h3>
          <div className="flex items-center gap-2 mb-3">
            <input checked={p.shippable} onChange={(e) => updateProduct({ shippable: e.target.checked })} type="checkbox" id="product-shippable" className="rounded border-gray-300" />
            <label htmlFor="product-shippable" className="text-xs font-medium text-gray-500">This product requires shipping</label>
          </div>
          {p.shippable && (
            <div className="grid grid-cols-4 gap-3">
              {(["height", "length", "weight", "width"] as const).map((dim) => (
                <div key={dim}>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{dim.charAt(0).toUpperCase() + dim.slice(1)} ({dim === "weight" ? "oz" : "in"})</label>
                  <input
                    value={p.package_dimensions[dim]}
                    onChange={(e) => updateProduct({ package_dimensions: { ...p.package_dimensions, [dim]: e.target.value } })}
                    type="number" step="0.01" min={0}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Marketing Features */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Marketing Features <span className="text-gray-300">(shown in pricing tables, max 15)</span></h3>
        <div className="space-y-2">
          {p.marketing_features.map((feat, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                value={feat.name}
                onChange={(e) => {
                  const updated = [...p.marketing_features];
                  updated[index] = { name: e.target.value };
                  updateProduct({ marketing_features: updated });
                }}
                type="text" maxLength={80}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="e.g. Unlimited users"
              />
              <button
                onClick={() => {
                  const updated = [...p.marketing_features];
                  updated.splice(index, 1);
                  updateProduct({ marketing_features: updated });
                }}
                disabled={p.marketing_features.length <= 1}
                className="text-gray-400 hover:text-red-500 disabled:opacity-30 text-sm px-1"
              >&times;</button>
            </div>
          ))}
          {p.marketing_features.length < 15 && (
            <button onClick={() => updateProduct({ marketing_features: [...p.marketing_features, { name: "" }] })} className="text-blue-600 hover:text-blue-800 text-xs font-medium">
              + Add feature
            </button>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Metadata</h3>
        <div className="space-y-2">
          {p.metadata.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <input value={row.key} onChange={(e) => {
                const updated = [...p.metadata]; updated[index] = { ...updated[index], key: e.target.value };
                updateProduct({ metadata: updated });
              }} type="text" className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="Key" />
              <input value={row.value} onChange={(e) => {
                const updated = [...p.metadata]; updated[index] = { ...updated[index], value: e.target.value };
                updateProduct({ metadata: updated });
              }} type="text" className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="Value" />
              <button onClick={() => {
                const updated = [...p.metadata]; updated.splice(index, 1); updateProduct({ metadata: updated });
              }} disabled={p.metadata.length <= 1} className="text-gray-400 hover:text-red-500 disabled:opacity-30 text-sm px-1">&times;</button>
            </div>
          ))}
          <button onClick={() => updateProduct({ metadata: [...p.metadata, { key: "", value: "" }] })} className="text-blue-600 hover:text-blue-800 text-xs font-medium">+ Add metadata</button>
        </div>
      </div>

      {/* ── INITIAL PRICE ── */}
      <div className="border-t-2 border-gray-200 pt-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Initial Price</h3>

        {/* Pricing Model */}
        <div className="mb-5">
          <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Pricing Model</h5>
          <div className="grid grid-cols-3 gap-2">
            {pricingModels.map((m) => (
              <label
                key={m.value}
                className={`relative flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                  price.pricing_model === m.value ? "border-purple-500 bg-purple-50" : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <input type="radio" value={m.value} checked={price.pricing_model === m.value} onChange={() => updatePrice({ pricing_model: m.value })} className="mt-0.5" />
                <div>
                  <span className="text-sm font-medium text-gray-900">{m.label}</span>
                  <p className="text-xs text-gray-500 mt-0.5">{m.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Usage-based sub-model */}
        {price.pricing_model === "usage_based" && (
          <div className="mb-5">
            <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Usage Pricing Sub-model</h5>
            <div className="flex gap-3">
              {usageSubModels.map((sm) => (
                <label
                  key={sm.value}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-sm transition-colors ${
                    price.usage_sub_model === sm.value ? "border-purple-500 bg-purple-50 text-purple-700" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <input type="radio" value={sm.value} checked={price.usage_sub_model === sm.value} onChange={() => updatePrice({ usage_sub_model: sm.value })} className="sr-only" />
                  {sm.label}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Frequency & Billing */}
        <div className="mb-5">
          <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Frequency & Billing</h5>
          <div className="grid grid-cols-3 gap-3">
            {price.pricing_model !== "usage_based" && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
                <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                  <button onClick={() => updatePrice({ type: "recurring" })} className={`flex-1 py-1.5 text-sm font-medium transition-colors ${price.type === "recurring" ? "bg-purple-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}>
                    Recurring
                  </button>
                  <button onClick={() => updatePrice({ type: "one_time" })} className={`flex-1 py-1.5 text-sm font-medium transition-colors border-l border-gray-300 ${price.type === "one_time" ? "bg-purple-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}>
                    One-time
                  </button>
                </div>
              </div>
            )}
            {(price.type === "recurring" || price.pricing_model === "usage_based") && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Billing Period</label>
                <select value={price.billing_period} onChange={(e) => updatePrice({ billing_period: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                  <option value="day:1">Daily</option>
                  <option value="week:1">Weekly</option>
                  <option value="month:1">Monthly</option>
                  <option value="month:3">Every 3 months</option>
                  <option value="month:6">Every 6 months</option>
                  <option value="year:1">Yearly</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            )}
            {price.billing_period === "custom" && (price.type === "recurring" || price.pricing_model === "usage_based") && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Interval</label>
                  <select value={price.custom_interval} onChange={(e) => updatePrice({ custom_interval: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                    <option value="day">Day</option>
                    <option value="week">Week</option>
                    <option value="month">Month</option>
                    <option value="year">Year</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Every N</label>
                  <input value={price.custom_interval_count} onChange={(e) => updatePrice({ custom_interval_count: Number(e.target.value) || 1 })} type="number" min={1} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                </div>
              </>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Currency</label>
              <select value={price.currency} onChange={(e) => updatePrice({ currency: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                {["usd", "eur", "gbp", "cad", "aud", "jpy", "chf"].map((c) => (
                  <option key={c} value={c}>{c.toUpperCase()}</option>
                ))}
              </select>
            </div>
            {price.type === "recurring" && price.pricing_model !== "usage_based" && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Usage Type</label>
                <select value={price.usage_type} onChange={(e) => updatePrice({ usage_type: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                  <option value="licensed">Licensed</option>
                  <option value="metered">Metered</option>
                </select>
              </div>
            )}
            {(price.pricing_model === "usage_based" || (price.type === "recurring" && price.usage_type === "metered")) && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Billing Meter ID</label>
                <input value={price.recurring_meter} onChange={(e) => updatePrice({ recurring_meter: e.target.value })} type="text" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="mtr_..." />
                <p className="text-xs text-gray-400 mt-0.5">Aggregation is configured on the Meter object.</p>
              </div>
            )}
          </div>
        </div>

        {/* Amount */}
        <div className="mb-5">
          <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Amount</h5>
          {showStandard && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Unit Price ($)</label>
                <input value={price.amount ?? ""} onChange={(e) => updatePrice({ amount: e.target.value ? Number(e.target.value) : null })} type="number" step="0.01" min={0} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="49.99" />
              </div>
            </div>
          )}
          {showPackage && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Price per package ($)</label>
                <input value={price.amount ?? ""} onChange={(e) => updatePrice({ amount: e.target.value ? Number(e.target.value) : null })} type="number" step="0.01" min={0} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="10.00" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Units per package</label>
                <input value={price.package_size ?? ""} onChange={(e) => updatePrice({ package_size: e.target.value ? Number(e.target.value) : null })} type="number" min={2} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="e.g. 10" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Rounding</label>
                <select value={price.package_round} onChange={(e) => updatePrice({ package_round: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                  <option value="up">Round up</option>
                  <option value="down">Round down</option>
                </select>
              </div>
            </div>
          )}
          {showTiers && (
            <div className="space-y-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-1.5 px-2 font-medium text-gray-500">Up to (units)</th>
                    <th className="text-left py-1.5 px-2 font-medium text-gray-500">Unit amount ($)</th>
                    <th className="text-left py-1.5 px-2 font-medium text-gray-500">Flat fee ($)</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {price.tiers.map((tier: any, idx: number) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="py-1.5 px-2">
                        {idx < price.tiers.length - 1 ? (
                          <input value={tier.up_to} onChange={(e) => {
                            const updated = [...price.tiers]; updated[idx] = { ...updated[idx], up_to: e.target.value };
                            updatePrice({ tiers: updated });
                          }} type="number" min={1} className="w-full border border-gray-300 rounded px-2 py-1 text-sm" placeholder="e.g. 100" />
                        ) : (
                          <span className="text-gray-400 text-sm italic">Unlimited</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2">
                        <input value={tier.unit_amount} onChange={(e) => {
                          const updated = [...price.tiers]; updated[idx] = { ...updated[idx], unit_amount: e.target.value };
                          updatePrice({ tiers: updated });
                        }} type="number" step="0.01" min={0} className="w-full border border-gray-300 rounded px-2 py-1 text-sm" placeholder="0.00" />
                      </td>
                      <td className="py-1.5 px-2">
                        <input value={tier.flat_amount} onChange={(e) => {
                          const updated = [...price.tiers]; updated[idx] = { ...updated[idx], flat_amount: e.target.value };
                          updatePrice({ tiers: updated });
                        }} type="number" step="0.01" min={0} className="w-full border border-gray-300 rounded px-2 py-1 text-sm" placeholder="0.00" />
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        {price.tiers.length > 1 && (
                          <button onClick={() => { const updated = [...price.tiers]; updated.splice(idx, 1); updatePrice({ tiers: updated }); }} className="text-gray-400 hover:text-red-500 text-sm">&times;</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={() => {
                const updated = [...price.tiers];
                updated.splice(updated.length - 1, 0, { up_to: "", unit_amount: "", flat_amount: "" });
                updatePrice({ tiers: updated });
              }} className="text-blue-600 hover:text-blue-800 text-xs font-medium">+ Add tier</button>
            </div>
          )}
          {price.pricing_model === "customer_chooses" && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Preset Amount ($)</label>
                <input value={price.custom_unit_amount_preset ?? ""} onChange={(e) => updatePrice({ custom_unit_amount_preset: e.target.value ? Number(e.target.value) : null })} type="number" step="0.01" min={0} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="Default amount shown" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Minimum ($)</label>
                <input value={price.custom_unit_amount_minimum ?? ""} onChange={(e) => updatePrice({ custom_unit_amount_minimum: e.target.value ? Number(e.target.value) : null })} type="number" step="0.01" min={0} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="Min charge" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Maximum ($)</label>
                <input value={price.custom_unit_amount_maximum ?? ""} onChange={(e) => updatePrice({ custom_unit_amount_maximum: e.target.value ? Number(e.target.value) : null })} type="number" step="0.01" min={0} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="Max charge" />
              </div>
            </div>
          )}
        </div>

        {/* Advanced */}
        <div>
          <button onClick={() => updatePrice({ show_advanced: !price.show_advanced })} className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide hover:text-gray-600 transition-colors">
            <span className={`inline-block transition-transform text-[10px] ${price.show_advanced ? "rotate-90" : ""}`}>&#9654;</span>
            Advanced
          </button>
          {price.show_advanced && (
            <div className="mt-3 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Price Description (nickname)</label>
                  <input value={price.nickname} onChange={(e) => updatePrice({ nickname: e.target.value })} type="text" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="Internal label (optional)" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Lookup Key <span className="text-gray-400">(max 200)</span></label>
                  <input value={price.lookup_key} onChange={(e) => updatePrice({ lookup_key: e.target.value })} type="text" maxLength={200} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="Optional identifier" />
                  {price.lookup_key && (
                    <label className="flex items-center gap-1 mt-1 text-xs text-gray-400">
                      <input checked={price.transfer_lookup_key} onChange={(e) => updatePrice({ transfer_lookup_key: e.target.checked })} type="checkbox" className="rounded border-gray-300" />
                      Transfer from existing price
                    </label>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Tax Behavior</label>
                  <select value={price.tax_behavior} onChange={(e) => updatePrice({ tax_behavior: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                    <option value="unspecified">Unspecified</option>
                    <option value="inclusive">Inclusive</option>
                    <option value="exclusive">Exclusive</option>
                  </select>
                </div>
              </div>
              {/* Currency Options */}
              <div>
                <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Currency Options <span className="text-gray-300 normal-case">(multi-currency overrides)</span></h5>
                <div className="space-y-2">
                  {price.currency_options.map((opt: any, index: number) => (
                    <div key={index} className="flex items-center gap-2">
                      <select value={opt.currency} onChange={(e) => {
                        const updated = [...price.currency_options]; updated[index] = { ...updated[index], currency: e.target.value };
                        updatePrice({ currency_options: updated });
                      }} className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                        <option value="">--</option>
                        {["usd", "eur", "gbp", "cad", "aud", "jpy", "chf"].map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                      </select>
                      <input value={opt.unit_amount ?? ""} onChange={(e) => {
                        const updated = [...price.currency_options]; updated[index] = { ...updated[index], unit_amount: e.target.value ? Number(e.target.value) : null };
                        updatePrice({ currency_options: updated });
                      }} type="number" step="0.01" min={0} className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="Unit amount in that currency ($)" />
                      <button onClick={() => { const updated = [...price.currency_options]; updated.splice(index, 1); updatePrice({ currency_options: updated }); }} disabled={price.currency_options.length <= 1} className="text-gray-400 hover:text-red-500 disabled:opacity-30 text-sm px-1">&times;</button>
                    </div>
                  ))}
                  <button onClick={() => updatePrice({ currency_options: [...price.currency_options, { currency: "", unit_amount: null }] })} className="text-blue-600 hover:text-blue-800 text-xs font-medium">+ Add currency</button>
                </div>
              </div>
              {/* Price Metadata */}
              <div>
                <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Price Metadata</h5>
                <div className="space-y-2">
                  {price.metadata.map((row: any, index: number) => (
                    <div key={index} className="flex items-center gap-2">
                      <input value={row.key} onChange={(e) => { const updated = [...price.metadata]; updated[index] = { ...updated[index], key: e.target.value }; updatePrice({ metadata: updated }); }} type="text" className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="Key" />
                      <input value={row.value} onChange={(e) => { const updated = [...price.metadata]; updated[index] = { ...updated[index], value: e.target.value }; updatePrice({ metadata: updated }); }} type="text" className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="Value" />
                      <button onClick={() => { const updated = [...price.metadata]; updated.splice(index, 1); updatePrice({ metadata: updated }); }} disabled={price.metadata.length <= 1} className="text-gray-400 hover:text-red-500 disabled:opacity-30 text-sm px-1">&times;</button>
                    </div>
                  ))}
                  <button onClick={() => updatePrice({ metadata: [...price.metadata, { key: "", value: "" }] })} className="text-blue-600 hover:text-blue-800 text-xs font-medium">+ Add metadata</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 pt-2 border-t border-gray-100">
        <button
          onClick={handleCreate}
          disabled={!p.name.trim() || !hasCloneChanges || creatingProductAndPrice}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm font-medium py-1.5 px-4 rounded-lg"
        >
          {creatingProductAndPrice ? "Creating..." : cloneSourceProduct ? "Clone Product + Price" : "Create Product + Price"}
        </button>
        <button onClick={cancelCreate} className="text-gray-500 hover:text-gray-700 text-sm font-medium py-1.5 px-4">Cancel</button>
        {cloneSourceProduct && !hasCloneChanges && (
          <span className="text-xs text-amber-600 self-center ml-2">Change at least one field before saving</span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// CreateCouponForm sub-component
// ============================================================================
function CreateCouponForm({
  newCoupon,
  updateCoupon,
  setNewCoupon,
  nativeProducts,
  handleCreateCoupon,
  onCancel,
}: any) {
  const c = newCoupon as NewCoupon;

  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-5">
      <h2 className="text-lg font-semibold text-gray-900">New Coupon</h2>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Coupon Name <span className="text-gray-400">(max 40 chars)</span></label>
          <input value={c.name} onChange={(e) => updateCoupon({ name: e.target.value })} type="text" maxLength={40} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="e.g. 20% Launch Discount" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Custom ID <span className="text-gray-400">(optional)</span></label>
          <input value={c.custom_id} onChange={(e) => updateCoupon({ custom_id: e.target.value })} type="text" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="Auto-generated if blank" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Discount Type</label>
          <div className="flex gap-4 mt-1.5">
            <label className="flex items-center gap-1.5 text-sm text-gray-700">
              <input type="radio" checked={c.discount_type === "percent"} onChange={() => updateCoupon({ discount_type: "percent" })} /> Percentage
            </label>
            <label className="flex items-center gap-1.5 text-sm text-gray-700">
              <input type="radio" checked={c.discount_type === "amount"} onChange={() => updateCoupon({ discount_type: "amount" })} /> Fixed Amount
            </label>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {c.discount_type === "percent" ? (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Percent Off</label>
            <input value={c.percent_off ?? ""} onChange={(e) => updateCoupon({ percent_off: e.target.value ? Number(e.target.value) : null })} type="number" step="0.01" min={0} max={100} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="e.g. 20" />
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Amount Off ($)</label>
              <input value={c.amount_off ?? ""} onChange={(e) => updateCoupon({ amount_off: e.target.value ? Number(e.target.value) : null })} type="number" step="0.01" min={0} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="e.g. 10.00" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Currency</label>
              <select value={c.currency} onChange={(e) => updateCoupon({ currency: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                {["usd", "eur", "gbp", "cad", "aud"].map((cur) => <option key={cur} value={cur}>{cur.toUpperCase()}</option>)}
              </select>
            </div>
          </>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Duration</label>
          <select value={c.duration} onChange={(e) => updateCoupon({ duration: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            <option value="once">Once</option>
            <option value="repeating">Repeating</option>
            <option value="forever">Forever</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {c.duration === "repeating" && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Duration in Months</label>
            <input value={c.duration_in_months ?? ""} onChange={(e) => updateCoupon({ duration_in_months: e.target.value ? Number(e.target.value) : null })} type="number" min={1} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="e.g. 3" />
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Max Redemptions</label>
          <input value={c.max_redemptions ?? ""} onChange={(e) => updateCoupon({ max_redemptions: e.target.value ? Number(e.target.value) : null })} type="number" min={1} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="Unlimited" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Redeem By</label>
          <input value={c.redeem_by} onChange={(e) => updateCoupon({ redeem_by: e.target.value })} type="date" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
        </div>
      </div>

      {/* Applies to products */}
      {nativeProducts.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Applies to Products <span className="text-gray-300">(leave empty for all)</span></h3>
          <div className="flex flex-wrap gap-2">
            {nativeProducts.map((prod: any) => (
              <label key={prod.id} className="flex items-center gap-1.5 text-sm text-gray-700 bg-gray-50 rounded px-2 py-1">
                <input
                  type="checkbox"
                  checked={c.applies_to_products.includes(prod.stripe_id)}
                  onChange={(e) => {
                    const updated = e.target.checked
                      ? [...c.applies_to_products, prod.stripe_id]
                      : c.applies_to_products.filter((id: string) => id !== prod.stripe_id);
                    updateCoupon({ applies_to_products: updated });
                  }}
                  className="rounded border-gray-300"
                />
                {prod.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Multi-currency amounts for fixed-amount coupons */}
      {c.discount_type === "amount" && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Additional Currency Amounts <span className="text-gray-300">(optional)</span></h3>
          <div className="space-y-2">
            {c.currency_options.map((opt, index) => (
              <div key={index} className="flex items-center gap-2">
                <select value={opt.currency} onChange={(e) => {
                  const updated = [...c.currency_options]; updated[index] = { ...updated[index], currency: e.target.value };
                  updateCoupon({ currency_options: updated });
                }} className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                  <option value="">--</option>
                  {["eur", "gbp", "cad", "aud", "jpy", "chf"].map((cur) => <option key={cur} value={cur}>{cur.toUpperCase()}</option>)}
                </select>
                <input value={opt.amount_off ?? ""} onChange={(e) => {
                  const updated = [...c.currency_options]; updated[index] = { ...updated[index], amount_off: e.target.value ? Number(e.target.value) : null };
                  updateCoupon({ currency_options: updated });
                }} type="number" step="0.01" min={0} className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="Amount off in that currency" />
                <button onClick={() => { const updated = [...c.currency_options]; updated.splice(index, 1); updateCoupon({ currency_options: updated }); }} disabled={c.currency_options.length <= 1} className="text-gray-400 hover:text-red-500 disabled:opacity-30 text-sm px-1">&times;</button>
              </div>
            ))}
            <button onClick={() => updateCoupon({ currency_options: [...c.currency_options, { currency: "", amount_off: null }] })} className="text-blue-600 hover:text-blue-800 text-xs font-medium">+ Add currency</button>
          </div>
        </div>
      )}

      {/* Coupon Metadata */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Metadata</h3>
        <div className="space-y-2">
          {c.metadata.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <input value={row.key} onChange={(e) => { const updated = [...c.metadata]; updated[index] = { ...updated[index], key: e.target.value }; updateCoupon({ metadata: updated }); }} type="text" className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="Key" />
              <input value={row.value} onChange={(e) => { const updated = [...c.metadata]; updated[index] = { ...updated[index], value: e.target.value }; updateCoupon({ metadata: updated }); }} type="text" className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="Value" />
              <button onClick={() => { const updated = [...c.metadata]; updated.splice(index, 1); updateCoupon({ metadata: updated }); }} disabled={c.metadata.length <= 1} className="text-gray-400 hover:text-red-500 disabled:opacity-30 text-sm px-1">&times;</button>
            </div>
          ))}
          <button onClick={() => updateCoupon({ metadata: [...c.metadata, { key: "", value: "" }] })} className="text-blue-600 hover:text-blue-800 text-xs font-medium">+ Add metadata</button>
        </div>
      </div>

      <div className="flex gap-2 pt-2 border-t border-gray-100">
        <button
          onClick={handleCreateCoupon}
          disabled={c.discount_type === "percent" ? !c.percent_off : !c.amount_off}
          className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white text-sm font-medium py-1.5 px-4 rounded-lg"
        >
          Create Coupon
        </button>
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-700 text-sm font-medium py-1.5 px-4">Cancel</button>
      </div>
    </div>
  );
}
