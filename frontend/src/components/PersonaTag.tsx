const PERSONA_COLORS: Record<string, string> = {
  "marketing-leader": "bg-violet-100 text-violet-800",
  "sales-leader": "bg-sky-100 text-sky-800",
  "revenue-ops": "bg-rose-100 text-rose-800",
  "product-manager": "bg-fuchsia-100 text-fuchsia-800",
  "demand-gen": "bg-cyan-100 text-cyan-800",
  "content-marketer": "bg-teal-100 text-teal-800",
  "social-media": "bg-pink-100 text-pink-800",
  executive: "bg-amber-100 text-amber-800",
  "it-admin": "bg-slate-100 text-slate-800",
};

export function PersonaTag({ persona }: { persona: string }) {
  const color = PERSONA_COLORS[persona] || "bg-violet-50 text-violet-700";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}
    >
      {persona}
    </span>
  );
}
