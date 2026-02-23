import { useState } from "react";
import { Quote } from "lucide-react";
import { useQuotes, useThemes } from "@/hooks/useAnalytics";
import { QuoteCard } from "@/components/QuoteCard";
import { Pagination } from "@/components/Pagination";
import { CardSkeleton } from "@/components/ui/CardSkeleton";
import { EmptyState } from "@/components/ui/EmptyState";

export function QuoteLibrary() {
  const [theme, setTheme] = useState("");
  const [company, setCompany] = useState("");
  const [sentiment, setSentiment] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 30;

  const { data: themes } = useThemes();
  const { data, isLoading } = useQuotes({
    theme: theme || undefined,
    company: company || undefined,
    sentiment: sentiment || undefined,
    limit,
    offset,
  });

  return (
    <div className="max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Quote Library</h1>
        <p className="text-muted-foreground">
          Customer quotes extracted from meeting stories
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select
          value={theme}
          onChange={(e) => {
            setTheme(e.target.value);
            setOffset(0);
          }}
          className="text-sm border rounded-md px-3 py-1.5 bg-background"
          aria-label="Filter by theme"
        >
          <option value="">All themes</option>
          {themes?.map((t) => (
            <option key={t.theme} value={t.theme}>
              {t.theme} ({t.count})
            </option>
          ))}
        </select>

        <input
          type="text"
          value={company}
          onChange={(e) => {
            setCompany(e.target.value);
            setOffset(0);
          }}
          placeholder="Filter by company..."
          className="text-sm border rounded-md px-3 py-1.5 bg-background"
        />

        <select
          value={sentiment}
          onChange={(e) => {
            setSentiment(e.target.value);
            setOffset(0);
          }}
          className="text-sm border rounded-md px-3 py-1.5 bg-background"
          aria-label="Filter by sentiment"
        >
          <option value="">All sentiments</option>
          <option value="positive">Positive</option>
          <option value="negative">Negative</option>
          <option value="neutral">Neutral</option>
          <option value="mixed">Mixed</option>
        </select>

        {(theme || company || sentiment) && (
          <button
            onClick={() => {
              setTheme("");
              setCompany("");
              setSentiment("");
              setOffset(0);
            }}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Clear filters
          </button>
        )}
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}

      {data && data.items.length === 0 && (
        <EmptyState
          icon={Quote}
          title="No quotes found"
          description="Quotes are automatically extracted from customer stories in meetings."
        />
      )}

      {data && data.items.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.items.map((quote, i) => (
              <QuoteCard key={`${quote.story_id}-${i}`} quote={quote} />
            ))}
          </div>

          <Pagination
            total={data.total}
            limit={limit}
            offset={offset}
            onPageChange={setOffset}
          />
        </>
      )}
    </div>
  );
}
