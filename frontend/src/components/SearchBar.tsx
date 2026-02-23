import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import { useSearch } from "@/hooks/useContent";
import { truncate } from "@/lib/utils";

export function SearchBar({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { data, isLoading } = useSearch(query);

  return (
    <div className="relative w-96">
      <div className="flex items-center gap-2 border rounded-md px-3 py-1.5 bg-background">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          autoFocus
          type="text"
          placeholder="Search stories & content..."
          className="flex-1 bg-transparent text-sm outline-none"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button onClick={onClose} aria-label="Close search">
          <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
        </button>
      </div>

      {query.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border rounded-md shadow-lg max-h-80 overflow-y-auto z-50">
          {isLoading && (
            <div className="p-3 text-sm text-muted-foreground">Searching...</div>
          )}
          {data && data.stories.length === 0 && data.content.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground">No results found</div>
          )}
          {data && data.stories.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted">
                Stories ({data.stories.length})
              </div>
              {data.stories.slice(0, 5).map((story) => (
                <button
                  key={story.id}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                  onClick={() => {
                    navigate(`/stories/${story.id}`);
                    onClose();
                  }}
                >
                  <div className="font-medium">{story.title}</div>
                  {story.summary && (
                    <div className="text-xs text-muted-foreground">
                      {truncate(story.summary, 80)}
                    </div>
                  )}
                </button>
              ))}
              {data.stories.length > 5 && (
                <button
                  className="w-full text-left px-3 py-2 text-xs font-medium text-primary hover:bg-accent transition-colors"
                  onClick={() => {
                    navigate(`/stories?q=${encodeURIComponent(query)}`);
                    onClose();
                  }}
                >
                  View all {data.stories.length} stories
                </button>
              )}
            </div>
          )}
          {data && data.content.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted">
                Content ({data.content.length})
              </div>
              {data.content.slice(0, 5).map((item) => (
                <button
                  key={item.id}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                  onClick={() => {
                    navigate(`/stories/${item.story_id}`);
                    onClose();
                  }}
                >
                  <div className="font-medium">{item.content_type}</div>
                  <div className="text-xs text-muted-foreground">
                    {truncate(item.content, 80)}
                  </div>
                </button>
              ))}
              {data.content.length > 5 && (
                <button
                  className="w-full text-left px-3 py-2 text-xs font-medium text-primary hover:bg-accent transition-colors"
                  onClick={() => {
                    navigate(`/content?q=${encodeURIComponent(query)}`);
                    onClose();
                  }}
                >
                  View all {data.content.length} content items
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
