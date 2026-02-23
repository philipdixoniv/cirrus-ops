import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  sort_order: number;
}

interface SalesQuoteFormData {
  customer_name: string;
  customer_company?: string;
  customer_email?: string;
  discount_pct?: number;
  notes?: string;
  valid_until?: string;
  items: Array<{ description: string; quantity: number; unit_price: number; sort_order: number }>;
}

interface SalesQuoteFormProps {
  initialData?: {
    customer_name?: string;
    customer_company?: string;
    customer_email?: string;
    discount_pct?: number;
    notes?: string;
    valid_until?: string;
    items?: LineItem[];
  };
  onSubmit: (data: SalesQuoteFormData) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function SalesQuoteForm({
  initialData,
  onSubmit,
  onCancel,
  isLoading,
}: SalesQuoteFormProps) {
  const [customerName, setCustomerName] = useState(initialData?.customer_name || "");
  const [customerCompany, setCustomerCompany] = useState(initialData?.customer_company || "");
  const [customerEmail, setCustomerEmail] = useState(initialData?.customer_email || "");
  const [discountPct, setDiscountPct] = useState(initialData?.discount_pct || 0);
  const [validUntil, setValidUntil] = useState(initialData?.valid_until || "");
  const [notes, setNotes] = useState(initialData?.notes || "");
  const [items, setItems] = useState<LineItem[]>(
    initialData?.items?.length
      ? initialData.items
      : [{ description: "", quantity: 1, unit_price: 0, sort_order: 0 }]
  );

  const addItem = () => {
    setItems([...items, { description: "", quantity: 1, unit_price: 0, sort_order: items.length }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof LineItem, value: string | number) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const discountAmount = subtotal * (discountPct / 100);
  const total = subtotal - discountAmount;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      customer_name: customerName,
      customer_company: customerCompany || undefined,
      customer_email: customerEmail || undefined,
      discount_pct: discountPct || undefined,
      notes: notes || undefined,
      valid_until: validUntil || undefined,
      items: items
        .filter((item) => item.description.trim())
        .map((item, i) => ({ ...item, sort_order: i })),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="border rounded-lg p-6 bg-card space-y-6">
      {/* Customer info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            Customer Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            required
            className="w-full text-sm border rounded-md px-3 py-1.5 bg-background"
            placeholder="John Smith"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Company</label>
          <input
            type="text"
            value={customerCompany}
            onChange={(e) => setCustomerCompany(e.target.value)}
            className="w-full text-sm border rounded-md px-3 py-1.5 bg-background"
            placeholder="Acme Corp"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            className="w-full text-sm border rounded-md px-3 py-1.5 bg-background"
            placeholder="john@acme.com"
          />
        </div>
      </div>

      {/* Line items */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Line Items</h3>
          <button
            type="button"
            onClick={addItem}
            className="flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-accent transition-colors"
          >
            <Plus className="h-3 w-3" /> Add Item
          </button>
        </div>

        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-start">
              <div className="col-span-5">
                {i === 0 && <label className="block text-xs text-muted-foreground mb-1">Description</label>}
                <input
                  type="text"
                  value={item.description}
                  onChange={(e) => updateItem(i, "description", e.target.value)}
                  className="w-full text-sm border rounded-md px-3 py-1.5 bg-background"
                  placeholder="Product or service"
                />
              </div>
              <div className="col-span-2">
                {i === 0 && <label className="block text-xs text-muted-foreground mb-1">Qty</label>}
                <input
                  type="number"
                  value={item.quantity}
                  onChange={(e) => updateItem(i, "quantity", parseFloat(e.target.value) || 0)}
                  min={0}
                  step="any"
                  className="w-full text-sm border rounded-md px-3 py-1.5 bg-background"
                />
              </div>
              <div className="col-span-3">
                {i === 0 && <label className="block text-xs text-muted-foreground mb-1">Unit Price</label>}
                <input
                  type="number"
                  value={item.unit_price}
                  onChange={(e) => updateItem(i, "unit_price", parseFloat(e.target.value) || 0)}
                  min={0}
                  step="0.01"
                  className="w-full text-sm border rounded-md px-3 py-1.5 bg-background"
                />
              </div>
              <div className="col-span-1 text-sm text-right pt-1.5">
                {i === 0 && <label className="block text-xs text-muted-foreground mb-1">Total</label>}
                <span className="text-muted-foreground">
                  {formatCurrency(item.quantity * item.unit_price, true)}
                </span>
              </div>
              <div className="col-span-1 pt-1.5">
                {i === 0 && <label className="block text-xs text-muted-foreground mb-1">&nbsp;</label>}
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    className="p-1 text-muted-foreground hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Totals & extras */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Valid Until</label>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="w-full text-sm border rounded-md px-3 py-1.5 bg-background"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full text-sm border rounded-md px-3 py-1.5 bg-background resize-none"
              placeholder="Additional notes..."
            />
          </div>
        </div>

        <div className="border rounded-lg p-4 bg-muted/30 space-y-2 self-start">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatCurrency(subtotal, true)}</span>
          </div>
          <div className="flex items-center justify-between text-sm gap-2">
            <span className="text-muted-foreground">Discount</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={discountPct}
                onChange={(e) => setDiscountPct(parseFloat(e.target.value) || 0)}
                min={0}
                max={100}
                step="0.5"
                className="w-16 text-sm border rounded px-2 py-0.5 bg-background text-right"
              />
              <span className="text-muted-foreground">%</span>
              {discountAmount > 0 && (
                <span className="text-red-600 ml-1">-{formatCurrency(discountAmount, true)}</span>
              )}
            </div>
          </div>
          <div className="flex justify-between text-sm font-semibold border-t pt-2">
            <span>Total</span>
            <span>{formatCurrency(total, true)}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm border rounded-md hover:bg-accent transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading || !customerName.trim()}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isLoading ? "Saving..." : "Save Quote"}
        </button>
      </div>
    </form>
  );
}
