import { useState } from "react";
import { X, Search } from "lucide-react";
import { useStories } from "@/hooks/useStories";
import { useProfile } from "@/contexts/ProfileContext";

interface StoryPickerProps {
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onClose: () => void;
}

export function StoryPicker({ selectedIds, onSelect, onClose }: StoryPickerProps) {
  const { profileId } = useProfile();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));

  const { data, isLoading } = useStories({
    profile_id: profileId,
    limit: 50,
    offset: 0,
  });

  const stories = data?.items || [];
  const filtered = search
    ? stories.filter(
        (s) =>
          s.title.toLowerCase().includes(search.toLowerCase()) ||
          (s.summary || "").toLowerCase().includes(search.toLowerCase())
      )
    : stories;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleConfirm = () => {
    onSelect(Array.from(selected));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div className="bg-card border rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">Select Stories</h3>
          <button onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search stories..."
              className="w-full text-sm border rounded-md pl-8 pr-3 py-1.5 bg-background"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {isLoading && (
            <p className="text-sm text-muted-foreground p-4">Loading...</p>
          )}
          {filtered.length === 0 && !isLoading && (
            <p className="text-sm text-muted-foreground p-4 text-center">
              No stories found
            </p>
          )}
          {filtered.map((story) => (
            <label
              key={story.id}
              className="flex items-start gap-3 p-2 rounded hover:bg-accent cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.has(story.id)}
                onChange={() => toggle(story.id)}
                className="mt-0.5 rounded"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{story.title}</p>
                {story.summary && (
                  <p className="text-xs text-muted-foreground truncate">
                    {story.summary}
                  </p>
                )}
              </div>
            </label>
          ))}
        </div>

        <div className="flex items-center justify-between p-3 border-t">
          <span className="text-sm text-muted-foreground">
            {selected.size} selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm border rounded-md"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
