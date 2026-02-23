import { useState } from "react";
import { BookOpen } from "lucide-react";
import { useStories } from "@/hooks/useStories";
import { useProfile } from "@/contexts/ProfileContext";
import { StoryCard } from "@/components/StoryCard";
import { FilterBar } from "@/components/FilterBar";
import { Pagination } from "@/components/Pagination";
import { CardSkeleton } from "@/components/ui/CardSkeleton";
import { EmptyState } from "@/components/ui/EmptyState";

export function StoriesExplorer() {
  const { profileId } = useProfile();
  const [theme, setTheme] = useState("");
  const [sentiment, setSentiment] = useState("");
  const [minConfidence, setMinConfidence] = useState("");
  const [persona, setPersona] = useState("");
  const [funnelStage, setFunnelStage] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const { data, isLoading } = useStories({
    profile_id: profileId,
    theme: theme || undefined,
    sentiment: sentiment || undefined,
    min_confidence: minConfidence ? parseFloat(minConfidence) : undefined,
    persona: persona || undefined,
    funnel_stage: funnelStage || undefined,
    limit,
    offset,
  });

  return (
    <div className="max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Stories Explorer</h1>
        <p className="text-muted-foreground">
          Browse and filter extracted customer stories
        </p>
      </div>

      <FilterBar
        theme={theme}
        setTheme={(t) => {
          setTheme(t);
          setOffset(0);
        }}
        sentiment={sentiment}
        setSentiment={(s) => {
          setSentiment(s);
          setOffset(0);
        }}
        minConfidence={minConfidence}
        setMinConfidence={(c) => {
          setMinConfidence(c);
          setOffset(0);
        }}
        persona={persona}
        setPersona={(p) => {
          setPersona(p);
          setOffset(0);
        }}
        funnelStage={funnelStage}
        setFunnelStage={(f) => {
          setFunnelStage(f);
          setOffset(0);
        }}
      />

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}

      {data && data.items.length === 0 && (
        <EmptyState
          icon={BookOpen}
          title="No stories found"
          description="Try adjusting your filters or extract stories from meetings."
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {data?.items.map((story) => (
          <StoryCard key={story.id} story={story} />
        ))}
      </div>

      {data && (
        <Pagination
          total={data.total}
          limit={limit}
          offset={offset}
          onPageChange={setOffset}
        />
      )}
    </div>
  );
}
