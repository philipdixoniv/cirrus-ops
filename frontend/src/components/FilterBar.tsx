import { useThemes } from "@/hooks/useAnalytics";
import { useProfile } from "@/contexts/ProfileContext";

interface FilterBarProps {
  theme: string;
  setTheme: (t: string) => void;
  sentiment: string;
  setSentiment: (s: string) => void;
  minConfidence: string;
  setMinConfidence: (c: string) => void;
  persona?: string;
  setPersona?: (p: string) => void;
  funnelStage?: string;
  setFunnelStage?: (f: string) => void;
}

const SENTIMENTS = ["", "positive", "negative", "neutral", "mixed"];
const FUNNEL_STAGES = ["", "awareness", "consideration", "decision"];

export function FilterBar({
  theme,
  setTheme,
  sentiment,
  setSentiment,
  minConfidence,
  setMinConfidence,
  persona = "",
  setPersona,
  funnelStage = "",
  setFunnelStage,
}: FilterBarProps) {
  const { data: themes } = useThemes();
  const { activeProfile } = useProfile();
  const profilePersonas: string[] = (activeProfile as any)?.personas || [];

  const hasFilters =
    theme ||
    sentiment ||
    (minConfidence && minConfidence !== "0") ||
    persona ||
    funnelStage;

  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <select
        value={theme}
        onChange={(e) => setTheme(e.target.value)}
        className="text-sm border rounded-md px-3 py-1.5 bg-background"
      >
        <option value="">All themes</option>
        {themes?.map((t) => (
          <option key={t.theme} value={t.theme}>
            {t.theme} ({t.count})
          </option>
        ))}
      </select>

      <select
        value={sentiment}
        onChange={(e) => setSentiment(e.target.value)}
        className="text-sm border rounded-md px-3 py-1.5 bg-background"
      >
        <option value="">All sentiments</option>
        {SENTIMENTS.filter(Boolean).map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      {setPersona && profilePersonas.length > 0 && (
        <select
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          className="text-sm border rounded-md px-3 py-1.5 bg-background"
        >
          <option value="">All personas</option>
          {profilePersonas.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      )}

      {setFunnelStage && (
        <select
          value={funnelStage}
          onChange={(e) => setFunnelStage(e.target.value)}
          className="text-sm border rounded-md px-3 py-1.5 bg-background"
        >
          <option value="">All funnel stages</option>
          {FUNNEL_STAGES.filter(Boolean).map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      )}

      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground">Min confidence:</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={minConfidence || "0"}
          onChange={(e) => setMinConfidence(e.target.value)}
          className="w-24"
        />
        <span className="text-sm font-mono w-8">{minConfidence || "0"}</span>
      </div>

      {hasFilters && (
        <button
          onClick={() => {
            setTheme("");
            setSentiment("");
            setMinConfidence("");
            setPersona?.("");
            setFunnelStage?.("");
          }}
          className="text-sm text-muted-foreground hover:text-foreground underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
