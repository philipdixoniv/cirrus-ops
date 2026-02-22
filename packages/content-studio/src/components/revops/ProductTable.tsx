import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { getTierRate } from "@/lib/pricing";

// ---------------------------------------------------------------------------
// Indeterminate checkbox helper
// ---------------------------------------------------------------------------
function IndeterminateCheckbox({
  checked,
  indeterminate,
  onChange,
  className,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className={className}
    />
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface ProductTableProps {
  template: any;
  sectionQuantities: Record<string, Record<string, number>>;
  onSectionQuantitiesChange: (q: Record<string, Record<string, number>>) => void;
  hiddenProducts: Record<string, Set<string>>;
  onHiddenProductsChange: (hp: Record<string, Set<string>>) => void;
  calculatedQuote: any | null;
  termLength?: string;
  billingFrequency?: string;
  additionalDiscount?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ProductTable({
  template,
  sectionQuantities,
  onSectionQuantitiesChange,
  hiddenProducts,
  onHiddenProductsChange,
  calculatedQuote,
  termLength = "1_year",
  billingFrequency = "annual",
  additionalDiscount = 0,
}: ProductTableProps) {
  // ── Selection state ──
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [bulkQty, setBulkQty] = useState(1);

  const selectionKey = (sectionId: string, productId: string) => `${sectionId}::${productId}`;

  const isSelected = (sectionId: string, productId: string) =>
    selectedProducts.has(selectionKey(sectionId, productId));

  const isHidden = useCallback(
    (sectionId: string, productId: string) => {
      const set = hiddenProducts?.[sectionId];
      return set instanceof Set ? set.has(productId) : false;
    },
    [hiddenProducts],
  );

  // ── All product keys ──
  const allProductKeys = useMemo(() => {
    const keys: string[] = [];
    for (const section of template.sections) {
      for (const product of section.products) {
        keys.push(selectionKey(section.id, product.id));
      }
    }
    return keys;
  }, [template.sections]);

  const allProductsSelected = allProductKeys.length > 0 && allProductKeys.every((k) => selectedProducts.has(k));
  const someButNotAllSelected = !allProductsSelected && allProductKeys.some((k) => selectedProducts.has(k));
  const hasSelection = selectedProducts.size > 0;
  const selectionCount = selectedProducts.size;

  // ── Section selection helpers ──
  function isSectionFullySelected(section: any) {
    return (
      section.products.length > 0 &&
      section.products.every((p: any) => selectedProducts.has(selectionKey(section.id, p.id)))
    );
  }

  function isSectionPartiallySelected(section: any) {
    const some = section.products.some((p: any) => selectedProducts.has(selectionKey(section.id, p.id)));
    return some && !isSectionFullySelected(section);
  }

  // ── Toggle helpers ──
  function toggleProduct(sectionId: string, productId: string) {
    const key = selectionKey(sectionId, productId);
    const next = new Set(selectedProducts);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedProducts(next);
  }

  function toggleSection(section: any) {
    const keys = section.products.map((p: any) => selectionKey(section.id, p.id));
    const allSelected = keys.every((k: string) => selectedProducts.has(k));
    const next = new Set(selectedProducts);
    if (allSelected) keys.forEach((k: string) => next.delete(k));
    else keys.forEach((k: string) => next.add(k));
    setSelectedProducts(next);
  }

  function toggleAll() {
    if (allProductsSelected) setSelectedProducts(new Set());
    else setSelectedProducts(new Set(allProductKeys));
  }

  function clearSelection() {
    setSelectedProducts(new Set());
  }

  // ── Hidden helpers ──
  function toggleHidden(sectionId: string, productId: string) {
    const updated: Record<string, Set<string>> = {};
    for (const [key, val] of Object.entries(hiddenProducts)) {
      updated[key] = new Set(val);
    }
    if (!updated[sectionId]) updated[sectionId] = new Set();
    if (updated[sectionId].has(productId)) updated[sectionId].delete(productId);
    else updated[sectionId].add(productId);
    onHiddenProductsChange(updated);
  }

  function toggleHiddenBulk() {
    const updated: Record<string, Set<string>> = {};
    for (const [key, val] of Object.entries(hiddenProducts)) {
      updated[key] = new Set(val);
    }
    const selectedKeys = [...selectedProducts];
    const allHidden = selectedKeys.every((key) => {
      const [sId, pId] = key.split("::");
      return isHidden(sId, pId);
    });
    for (const key of selectedKeys) {
      const [sId, pId] = key.split("::");
      if (!updated[sId]) updated[sId] = new Set();
      if (allHidden) updated[sId].delete(pId);
      else updated[sId].add(pId);
    }
    onHiddenProductsChange(updated);
    clearSelection();
  }

  // ── Quantity helpers ──
  function getSectionQty(sectionId: string, productId: string) {
    return sectionQuantities?.[sectionId]?.[productId] || 0;
  }

  function updateSectionQty(sectionId: string, productId: string, event: React.ChangeEvent<HTMLInputElement>) {
    const qty = Math.max(0, parseInt(event.target.value) || 0);
    const updated = { ...sectionQuantities };
    if (!updated[sectionId]) updated[sectionId] = {};
    updated[sectionId] = { ...updated[sectionId], [productId]: qty };
    onSectionQuantitiesChange(updated);
  }

  function getTieredRateForProduct(product: any, sectionId: string) {
    const qty = getSectionQty(sectionId, product.id);
    return getTierRate(product.tiers || [], qty).rate;
  }

  function getTieredMonthly(product: any, sectionId: string) {
    const qty = getSectionQty(sectionId, product.id);
    return qty * getTieredRateForProduct(product, sectionId);
  }

  // ── Bulk actions ──
  function applyBulkQty() {
    const updated = { ...sectionQuantities };
    for (const key of selectedProducts) {
      const [sectionId, productId] = key.split("::");
      if (!updated[sectionId]) updated[sectionId] = {};
      updated[sectionId] = { ...updated[sectionId], [productId]: Math.max(0, bulkQty || 0) };
    }
    onSectionQuantitiesChange(updated);
    clearSelection();
  }

  function clearSelectedQuantities() {
    const updated = { ...sectionQuantities };
    for (const key of selectedProducts) {
      const [sectionId, productId] = key.split("::");
      if (!updated[sectionId]) updated[sectionId] = {};
      updated[sectionId] = { ...updated[sectionId], [productId]: 0 };
    }
    onSectionQuantitiesChange(updated);
    clearSelection();
  }

  // ── Footer computations (exclude hidden items) ──
  const dynamicSubTotalMonthly = useMemo(() => {
    let total = 0;
    for (const section of template.sections) {
      for (const product of section.products) {
        if (isHidden(section.id, product.id)) continue;
        const qty = getSectionQty(section.id, product.id);
        if (section.type === "per_seat") {
          total += qty * (product.monthlyPrice || 0);
        } else if (section.type === "tiered") {
          total += qty * getTierRate(product.tiers || [], qty).rate;
        }
      }
    }
    return total;
  }, [template.sections, sectionQuantities, isHidden]);

  const dynamicDiscountPct = useMemo(() => {
    if (calculatedQuote) return calculatedQuote.totalDiscountPct || 0;
    const td = template.termDiscounts?.[termLength] || 0;
    const bd = template.billingDiscounts?.[billingFrequency] || 0;
    return td + bd + additionalDiscount / 100;
  }, [calculatedQuote, template, termLength, billingFrequency, additionalDiscount]);

  const dynamicDiscountableMonthly = useMemo(() => {
    let total = 0;
    for (const section of template.sections) {
      if (!section.discountApplicable) continue;
      for (const product of section.products) {
        if (isHidden(section.id, product.id)) continue;
        const qty = getSectionQty(section.id, product.id);
        if (section.type === "per_seat") {
          total += qty * (product.monthlyPrice || 0);
        } else if (section.type === "tiered") {
          total += qty * getTierRate(product.tiers || [], qty).rate;
        }
      }
    }
    return total;
  }, [template.sections, sectionQuantities, isHidden]);

  const dynamicDiscountMonthly = dynamicDiscountableMonthly * dynamicDiscountPct;

  const dynamicMaxSeats = useMemo(() => {
    let max = 0;
    for (const section of template.sections) {
      if (section.type !== "per_seat" || !section.discountApplicable) continue;
      for (const product of section.products) {
        if (isHidden(section.id, product.id)) continue;
        const qty = getSectionQty(section.id, product.id);
        if (qty > max) max = qty;
      }
    }
    return max;
  }, [template.sections, sectionQuantities, isHidden]);

  const dynamicAvgUnitPrice =
    dynamicMaxSeats > 0 ? (dynamicDiscountableMonthly - dynamicDiscountMonthly) / dynamicMaxSeats : 0;

  const dynamicTotalMonthly = dynamicSubTotalMonthly - dynamicDiscountMonthly;

  const dynamicOneTimeCost = useMemo(() => {
    let total = 0;
    for (const section of template.sections) {
      if (section.type !== "one_time") continue;
      for (const product of section.products) {
        if (isHidden(section.id, product.id)) continue;
        total += getSectionQty(section.id, product.id) * (product.price || 0);
      }
    }
    return total;
  }, [template.sections, sectionQuantities, isHidden]);

  const dynamicTotalAnnual = dynamicTotalMonthly * 12 + dynamicOneTimeCost;

  // ── Row class helper ──
  function rowClass(sectionId: string, productId: string) {
    const hidden = isHidden(sectionId, productId);
    const selected = isSelected(sectionId, productId);
    const hasQty = getSectionQty(sectionId, productId) > 0;
    if (hidden) return "border-b border-gray-100 opacity-40";
    if (selected) return "border-b border-gray-100 bg-indigo-50/60";
    if (hasQty) return "border-b border-gray-100 bg-blue-50/40";
    return "border-b border-gray-100";
  }

  // ── Eye icon ──
  function EyeIcon({ hidden: isItemHidden }: { hidden: boolean }) {
    if (!isItemHidden) {
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
          />
        </svg>
      );
    }
    return (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"
        />
      </svg>
    );
  }

  // ── Render ──
  return (
    <div className="px-6 pb-6">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-300 text-gray-500 text-xs uppercase tracking-wide">
            <th className="w-8 py-2">
              <IndeterminateCheckbox
                checked={allProductsSelected}
                indeterminate={someButNotAllSelected}
                onChange={toggleAll}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
            </th>
            <th className="w-8 py-2"></th>
            <th className="text-left py-2 font-bold">Feature Group</th>
            <th className="text-center py-2 font-bold">Units</th>
            <th className="text-center py-2 font-bold">Monthly QTY</th>
            <th className="text-right py-2 font-bold">Price Per Unit</th>
            <th className="text-right py-2 font-bold">Monthly Total</th>
            <th className="text-right py-2 font-bold">Annual Total</th>
          </tr>
        </thead>

        <tbody>
          {template.sections.map((section: any) => (
            <SectionBlock
              key={section.id}
              section={section}
              isSectionFullySelected={isSectionFullySelected}
              isSectionPartiallySelected={isSectionPartiallySelected}
              toggleSection={toggleSection}
              isSelected={isSelected}
              isHidden={isHidden}
              toggleProduct={toggleProduct}
              toggleHidden={toggleHidden}
              getSectionQty={getSectionQty}
              updateSectionQty={updateSectionQty}
              getTieredRateForProduct={getTieredRateForProduct}
              getTieredMonthly={getTieredMonthly}
              rowClass={rowClass}
              EyeIcon={EyeIcon}
            />
          ))}
        </tbody>

        <tfoot>
          {/* Sub Total */}
          <tr className="border-t border-gray-300">
            <td colSpan={6} className="py-2 text-right font-semibold text-gray-700">
              Sub Total
            </td>
            <td className="py-2 text-right font-semibold text-gray-900">${dynamicSubTotalMonthly.toFixed(2)}</td>
            <td className="py-2 text-right font-semibold text-gray-900">
              ${(dynamicSubTotalMonthly * 12).toFixed(2)}
            </td>
          </tr>

          {/* Discount */}
          {dynamicDiscountPct > 0 && (
            <>
              <tr className="text-gray-400 text-xs uppercase tracking-wide">
                <td className="pt-3"></td>
                <td className="pt-3"></td>
                <td className="pt-3"></td>
                <td></td>
                <td className="pt-3 text-right font-medium">Discount %</td>
                <td className="pt-3 text-right font-medium">Avg Unit Price</td>
                <td className="pt-3 text-right font-medium">Total</td>
                <td className="pt-3 text-right font-medium">Total</td>
              </tr>
              <tr className="text-gray-600">
                <td></td>
                <td></td>
                <td className="py-1.5 font-medium">Discount</td>
                <td></td>
                <td className="py-1.5 text-center font-medium">{(dynamicDiscountPct * 100).toFixed(0)}%</td>
                <td className="py-1.5 text-right">${dynamicAvgUnitPrice.toFixed(2)}</td>
                <td className="py-1.5 text-right font-medium">(${dynamicDiscountMonthly.toFixed(2)})</td>
                <td className="py-1.5 text-right font-medium">(${(dynamicDiscountMonthly * 12).toFixed(2)})</td>
              </tr>
            </>
          )}

          {/* Total */}
          <tr className="border-t-2 border-gray-900 text-gray-900">
            <td colSpan={6} className="py-2 text-right font-bold">
              Total
            </td>
            <td className="py-2 text-right font-bold text-lg">${dynamicTotalMonthly.toFixed(2)}</td>
            <td className="py-2 text-right font-bold text-lg">${dynamicTotalAnnual.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      {/* Bulk action toolbar */}
      {hasSelection && (
        <div className="sticky bottom-0 mt-4 bg-gray-900 text-white rounded-lg shadow-lg px-4 py-3 flex items-center justify-between transition-all duration-200">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-medium">{selectionCount} selected</span>
            <button onClick={clearSelection} className="text-gray-400 hover:text-white underline text-sm">
              Deselect all
            </button>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-300">Set qty</label>
            <input
              value={bulkQty}
              onChange={(e) => setBulkQty(Math.max(0, parseInt(e.target.value) || 0))}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyBulkQty();
              }}
              type="number"
              min={0}
              className="w-16 text-center text-sm bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white focus:ring-indigo-500 focus:border-indigo-500"
            />
            <button
              onClick={applyBulkQty}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-1 rounded transition-colors"
            >
              Apply
            </button>
            <div className="w-px h-5 bg-gray-600"></div>
            <button
              onClick={clearSelectedQuantities}
              className="bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium px-3 py-1 rounded transition-colors"
            >
              Clear qty
            </button>
            <div className="w-px h-5 bg-gray-600"></div>
            <button
              onClick={toggleHiddenBulk}
              className="bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium px-3 py-1 rounded transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"
                />
              </svg>
              Hide/Unhide
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section block sub-component (keeps the main render clean)
// ---------------------------------------------------------------------------
function SectionBlock({
  section,
  isSectionFullySelected,
  isSectionPartiallySelected,
  toggleSection,
  isSelected,
  isHidden,
  toggleProduct,
  toggleHidden,
  getSectionQty,
  updateSectionQty,
  getTieredRateForProduct,
  getTieredMonthly,
  rowClass,
  EyeIcon,
}: any) {
  return (
    <>
      {/* Section header */}
      <tr className="bg-gray-50">
        <td className="w-8 py-2 px-1 text-center">
          <IndeterminateCheckbox
            checked={isSectionFullySelected(section)}
            indeterminate={isSectionPartiallySelected(section)}
            onChange={() => toggleSection(section)}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
        </td>
        <td colSpan={7} className="py-2 px-1 font-semibold text-xs uppercase tracking-wide text-gray-600">
          {section.name}
        </td>
      </tr>

      {/* per_seat products */}
      {section.type === "per_seat" &&
        section.products.map((product: any) => (
          <tr key={product.id} className={rowClass(section.id, product.id)}>
            <td className="w-8 py-1.5 text-center">
              <input
                type="checkbox"
                checked={isSelected(section.id, product.id)}
                onChange={() => toggleProduct(section.id, product.id)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
            </td>
            <td className="w-8 py-1.5 text-center">
              <button
                onClick={() => toggleHidden(section.id, product.id)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title={isHidden(section.id, product.id) ? "Unhide item" : "Hide item"}
              >
                <EyeIcon hidden={isHidden(section.id, product.id)} />
              </button>
            </td>
            <td className="py-1.5 text-gray-900">{product.name}</td>
            <td className="py-1.5 text-gray-500 text-center">{product.unitLabel}</td>
            <td className="py-1.5 text-center">
              <input
                type="number"
                value={getSectionQty(section.id, product.id)}
                onChange={(e) => updateSectionQty(section.id, product.id, e)}
                min={0}
                className="w-16 text-center text-sm border-0 bg-transparent p-0 focus:ring-0 font-medium text-gray-900"
              />
            </td>
            <td className="py-1.5 text-right text-gray-700">${(product.monthlyPrice || 0).toFixed(2)}</td>
            <td className="py-1.5 text-right font-medium text-gray-900">
              ${(getSectionQty(section.id, product.id) * (product.monthlyPrice || 0)).toFixed(2)}
            </td>
            <td className="py-1.5 text-right font-medium text-gray-900">
              ${(getSectionQty(section.id, product.id) * (product.monthlyPrice || 0) * 12).toFixed(2)}
            </td>
          </tr>
        ))}

      {/* tiered products */}
      {section.type === "tiered" &&
        section.products.map((product: any) => (
          <tr key={product.id} className={rowClass(section.id, product.id)}>
            <td className="w-8 py-1.5 text-center">
              <input
                type="checkbox"
                checked={isSelected(section.id, product.id)}
                onChange={() => toggleProduct(section.id, product.id)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
            </td>
            <td className="w-8 py-1.5 text-center">
              <button
                onClick={() => toggleHidden(section.id, product.id)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title={isHidden(section.id, product.id) ? "Unhide item" : "Hide item"}
              >
                <EyeIcon hidden={isHidden(section.id, product.id)} />
              </button>
            </td>
            <td className="py-1.5 text-gray-900">{product.name}</td>
            <td className="py-1.5 text-gray-500 font-medium text-center">{product.unitLabel}</td>
            <td className="py-1.5 text-center">
              <input
                type="number"
                value={getSectionQty(section.id, product.id)}
                onChange={(e) => updateSectionQty(section.id, product.id, e)}
                min={0}
                className="w-16 text-center text-sm border-0 bg-transparent p-0 focus:ring-0 font-medium text-gray-900"
              />
            </td>
            <td className="py-1.5 text-right text-gray-700">
              ${getTieredRateForProduct(product, section.id).toFixed(2)}
            </td>
            <td className="py-1.5 text-right font-medium text-gray-900">
              ${getTieredMonthly(product, section.id).toFixed(2)}
            </td>
            <td className="py-1.5 text-right font-medium text-gray-900">
              ${(getTieredMonthly(product, section.id) * 12).toFixed(2)}
            </td>
          </tr>
        ))}

      {/* one_time products */}
      {section.type === "one_time" &&
        section.products.map((product: any) => (
          <tr key={product.id} className={rowClass(section.id, product.id)}>
            <td className="w-8 py-1.5 text-center">
              <input
                type="checkbox"
                checked={isSelected(section.id, product.id)}
                onChange={() => toggleProduct(section.id, product.id)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
            </td>
            <td className="w-8 py-1.5 text-center">
              <button
                onClick={() => toggleHidden(section.id, product.id)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title={isHidden(section.id, product.id) ? "Unhide item" : "Hide item"}
              >
                <EyeIcon hidden={isHidden(section.id, product.id)} />
              </button>
            </td>
            <td className="py-1.5 text-gray-900">{product.name}</td>
            <td className="py-1.5 text-gray-500 text-center">{product.duration || product.unitLabel}</td>
            <td className="py-1.5 text-center">
              <input
                type="number"
                value={getSectionQty(section.id, product.id)}
                onChange={(e) => updateSectionQty(section.id, product.id, e)}
                min={0}
                className="w-16 text-center text-sm border-0 bg-transparent p-0 focus:ring-0 font-medium text-gray-900"
              />
            </td>
            <td className="py-1.5 text-right text-gray-700">
              ${(product.price || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </td>
            <td colSpan={2} className="py-1.5 text-right font-medium text-gray-900">
              $
              {(getSectionQty(section.id, product.id) * (product.price || 0)).toLocaleString("en-US", {
                minimumFractionDigits: 2,
              })}
            </td>
          </tr>
        ))}
    </>
  );
}
