import { Copy, Check, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ThemeTag } from "./ThemeTag";
import type { QuoteItem } from "@/api/client";

interface QuoteCardProps {
  quote: QuoteItem;
}

export function QuoteCard({ quote }: QuoteCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(quote.quote);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border rounded-lg p-5 bg-card hover:border-primary/30 transition-colors space-y-3">
      {/* Quote text */}
      <blockquote className="text-sm italic text-foreground leading-relaxed">
        &ldquo;{quote.quote}&rdquo;
      </blockquote>

      {/* Attribution */}
      <div className="text-xs text-muted-foreground">
        {quote.customer_name && <span className="font-medium">{quote.customer_name}</span>}
        {quote.customer_name && quote.customer_company && <span> &mdash; </span>}
        {quote.customer_company && <span>{quote.customer_company}</span>}
      </div>

      {/* Theme tags */}
      {quote.themes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {quote.themes.slice(0, 3).map((t) => (
            <ThemeTag key={t} theme={t} />
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-accent transition-colors"
        >
          {copied ? (
            <><Check className="h-3 w-3 text-green-500" /> Copied</>
          ) : (
            <><Copy className="h-3 w-3" /> Copy</>
          )}
        </button>
        <Link
          to={`/stories/${quote.story_id}`}
          className="flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-accent transition-colors"
        >
          <ExternalLink className="h-3 w-3" /> Source
        </Link>
      </div>
    </div>
  );
}
