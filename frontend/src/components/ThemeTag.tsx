const THEME_COLORS: Record<string, string> = {
  "customer-story": "bg-blue-100 text-blue-800",
  "case-study": "bg-purple-100 text-purple-800",
  testimonial: "bg-green-100 text-green-800",
  "pain-point": "bg-red-100 text-red-800",
  "success-story": "bg-emerald-100 text-emerald-800",
  "competitive-insight": "bg-orange-100 text-orange-800",
  "product-feedback": "bg-yellow-100 text-yellow-800",
  "roi-metric": "bg-teal-100 text-teal-800",
  "customer-quote": "bg-indigo-100 text-indigo-800",
  "adoption-journey": "bg-cyan-100 text-cyan-800",
  pricing: "bg-amber-100 text-amber-800",
  onboarding: "bg-lime-100 text-lime-800",
  support: "bg-pink-100 text-pink-800",
  competitive: "bg-orange-100 text-orange-800",
  integration: "bg-violet-100 text-violet-800",
};

export function ThemeTag({ theme }: { theme: string }) {
  const color = THEME_COLORS[theme] || "bg-gray-100 text-gray-800";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}
    >
      {theme}
    </span>
  );
}
