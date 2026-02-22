import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Target,
  BookOpen,
  FileText,
  Video,
  BarChart3,
  Search,
  Quote,
  CalendarDays,
  ChevronDown,
} from "lucide-react";
import { useState } from "react";
import { SearchBar } from "./SearchBar";
import { useProfile } from "@/contexts/ProfileContext";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/campaigns", label: "Campaigns", icon: Target },
  { to: "/stories", label: "Stories", icon: BookOpen },
  { to: "/content", label: "Content Library", icon: FileText },
  { to: "/meetings", label: "Meetings", icon: Video },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/quotes", label: "Quotes", icon: Quote },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const { profiles, activeProfile, setActiveProfile } = useProfile();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card flex flex-col shrink-0">
        <div className="p-6 border-b">
          <h1 className="text-lg font-bold tracking-tight">Content Studio</h1>
          <p className="text-xs text-muted-foreground">Cirrus Ops</p>
        </div>

        {/* Profile switcher */}
        {profiles.length > 0 && (
          <div className="px-4 py-3 border-b">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Profile
            </label>
            <div className="relative">
              <select
                value={activeProfile?.id || ""}
                onChange={(e) => {
                  const p = profiles.find((p) => p.id === e.target.value);
                  setActiveProfile(p || null);
                }}
                className="w-full text-sm border rounded-md px-3 py-1.5 bg-background appearance-none pr-8"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        )}

        <nav className="flex-1 p-4 space-y-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
            const active =
              to === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 border-b flex items-center justify-between px-6 bg-card shrink-0">
          <div className="flex items-center gap-2">
            {searchOpen ? (
              <SearchBar onClose={() => setSearchOpen(false)} />
            ) : (
              <button
                onClick={() => setSearchOpen(true)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Search className="h-4 w-4" />
                Search stories & content...
              </button>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
