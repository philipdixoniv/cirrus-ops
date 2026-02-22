import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAccounts } from "@/hooks/revops/useAccounts";
import { useOrg } from "@/contexts/OrgContext";
import { useStripeInstances } from "@/contexts/StripeInstanceContext";
import { getSupabase } from "@/lib/supabase";

interface AccountSearchProps {
  value: string;
  onChange?: (value: string) => void;
  /** Alias used by QuoteCreate */
  onValueChange?: (value: string) => void;
  accountId?: string | null;
  onAccountIdChange?: ((id: string | null) => void) | React.Dispatch<React.SetStateAction<string | null>>;
  onSelect: (account: any) => void;
  recordType?: string | null;
  placeholder?: string;
  inputClass?: string;
  /** Alias used by QuoteCreate */
  inputClassName?: string;
}

export function AccountSearch({
  value,
  onChange,
  onValueChange,
  accountId,
  onAccountIdChange,
  onSelect,
  recordType = null,
  placeholder = "Search company name...",
  inputClass,
  inputClassName,
}: AccountSearchProps) {
  const emitValueChange = onChange ?? onValueChange ?? (() => {});
  const resolvedInputClass =
    inputClass ??
    inputClassName ??
    "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500";
  const { searchAccounts } = useAccounts();
  const { activeOrgId } = useOrg();
  const { activeInstanceId } = useStripeInstances();

  const [results, setResults] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const requiresStripeCustomer = useMemo(
    () => recordType === "upsell" || recordType === "renewal",
    [recordType],
  );

  async function searchStripeCustomers(query: string) {
    if (!activeOrgId) return [];
    try {
      const supabase = getSupabase();
      const { data } = await supabase.functions.invoke(
        "stripe-search-customers",
        {
          body: {
            org_id: activeOrgId,
            query,
            instance_id: activeInstanceId || undefined,
          },
        },
      );
      return (data?.customers || []).map((c: any) => ({
        id: `stripe:${c.stripe_id}`,
        name: c.name,
        email: c.email,
        stripe_customer_id: c.stripe_id,
        isStripe: true,
      }));
    } catch {
      return [];
    }
  }

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      emitValueChange(val);
      onAccountIdChange?.(null);

      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

      if (val.length < 2) {
        setResults([]);
        return;
      }

      debounceTimerRef.current = setTimeout(async () => {
        setSearching(true);
        try {
          if (requiresStripeCustomer) {
            const stripeResults = await searchStripeCustomers(val);
            setResults(stripeResults);
          } else {
            const [localResults, stripeResults] = await Promise.all([
              searchAccounts(val),
              searchStripeCustomers(val),
            ]);
            const localNames = new Set(
              localResults.map((a: any) => a.name.toLowerCase()),
            );
            const uniqueStripe = stripeResults.filter(
              (s: any) => !localNames.has(s.name.toLowerCase()),
            );
            setResults([...localResults, ...uniqueStripe]);
          }
        } finally {
          setSearching(false);
        }
      }, 300);
    },
    [emitValueChange, onAccountIdChange, requiresStripeCustomer, searchAccounts], // eslint-disable-line react-hooks/exhaustive-deps
  );

  function selectAccount(account: any) {
    emitValueChange(account.name);
    onAccountIdChange?.(account.isStripe ? null : account.id);
    onSelect(account);
    setShowDropdown(false);
    setResults([]);
  }

  function selectNewCustomer() {
    onAccountIdChange?.(null);
    onSelect(null);
    setShowDropdown(false);
    setResults([]);
  }

  function highlightMatch(name: string) {
    if (!value) return name;
    const regex = new RegExp(
      `(${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
      "gi",
    );
    return name.replace(
      regex,
      '<mark class="bg-yellow-100 rounded px-0.5">$1</mark>',
    );
  }

  // Click outside handler
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  return (
    <div className="relative" ref={wrapperRef}>
      <input
        type="text"
        value={value}
        onChange={handleInput}
        onFocus={() => setShowDropdown(true)}
        placeholder={placeholder}
        className={resolvedInputClass}
      />
      {showDropdown && (results.length > 0 || value.length >= 2) && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {results.map((account) => (
            <button
              key={account.id}
              onMouseDown={(e) => {
                e.preventDefault();
                selectAccount(account);
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2"
            >
              <span
                className="flex-1"
                dangerouslySetInnerHTML={{
                  __html: highlightMatch(account.name),
                }}
              />
              {account.email && (
                <span className="text-xs text-gray-400 truncate max-w-[150px]">
                  {account.email}
                </span>
              )}
              {account.isStripe && (
                <span className="text-[10px] font-medium text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                  Stripe
                </span>
              )}
            </button>
          ))}

          {searching && (
            <div className="px-3 py-2 text-sm text-gray-400">Searching...</div>
          )}

          {!searching && results.length === 0 && value.length >= 2 && (
            <div className="px-3 py-2 text-sm text-gray-400">
              No matching accounts
            </div>
          )}

          {value.length >= 2 && !requiresStripeCustomer && (
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                selectNewCustomer();
              }}
              className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 border-t border-gray-100 font-medium"
            >
              + New Customer "{value}"
            </button>
          )}
        </div>
      )}
    </div>
  );
}
