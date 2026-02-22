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
  GitBranch,
  ShoppingCart,
  TrendingUp,
  Package,
  CreditCard,
  FileCheck,
  Settings,
  Wrench,
  Users,
  LogOut,
} from "lucide-react";
import { useState } from "react";
import { SearchBar } from "./SearchBar";
import { useProfile } from "@/contexts/ProfileContext";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  minRole?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: "",
    items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Revenue Ops",
    items: [
      { to: "/pipeline", label: "Pipeline", icon: GitBranch },
      { to: "/orders", label: "Orders", icon: ShoppingCart },
      { to: "/analytics/revenue", label: "Analytics", icon: TrendingUp },
    ],
  },
  {
    title: "Content Studio",
    items: [
      { to: "/stories", label: "Stories", icon: BookOpen },
      { to: "/content", label: "Content Library", icon: FileText },
      { to: "/campaigns", label: "Campaigns", icon: Target },
      { to: "/meetings", label: "Meetings", icon: Video },
      { to: "/analytics/content", label: "Analytics", icon: BarChart3 },
      { to: "/quotes", label: "Quotes", icon: Quote },
      { to: "/calendar", label: "Calendar", icon: CalendarDays },
    ],
  },
  {
    title: "Admin",
    items: [
      { to: "/admin/products", label: "Products", icon: Package, minRole: "admin" },
      { to: "/admin/stripe", label: "Stripe", icon: CreditCard, minRole: "admin" },
      { to: "/admin/templates", label: "Templates", icon: FileCheck, minRole: "admin" },
      { to: "/admin/quote-config", label: "Quote Config", icon: Wrench, minRole: "admin" },
      { to: "/admin/setup", label: "Setup", icon: Settings, minRole: "admin" },
      { to: "/org/settings", label: "Settings", icon: Users },
    ],
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const { profiles, activeProfile, setActiveProfile } = useProfile();
  const { user, signOut } = useAuth();
  const { orgs, activeOrg, switchOrg, hasRole } = useOrg();

  function isActive(to: string) {
    if (to === "/") return location.pathname === "/";
    return location.pathname.startsWith(to);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card flex flex-col shrink-0">
        <div className="p-6 border-b">
          <h1 className="text-lg font-bold tracking-tight">Cirrus Ops</h1>
          {activeOrg && (
            <p className="text-xs text-muted-foreground">{activeOrg.name}</p>
          )}
        </div>

        {/* Org switcher */}
        {orgs.length > 1 && (
          <div className="px-4 py-3 border-b">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Organization
            </label>
            <div className="relative">
              <select
                value={activeOrg?.id || ""}
                onChange={(e) => switchOrg(e.target.value)}
                className="w-full text-sm border rounded-md px-3 py-1.5 bg-background appearance-none pr-8"
              >
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        )}

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

        <nav className="flex-1 p-4 space-y-4 overflow-y-auto">
          {NAV_SECTIONS.map((section, si) => (
            <div key={si}>
              {section.title && (
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-3">
                  {section.title}
                </div>
              )}
              <div className="space-y-0.5">
                {section.items
                  .filter((item) => !item.minRole || hasRole(item.minRole))
                  .map(({ to, label, icon: Icon }) => (
                    <Link
                      key={to}
                      to={to}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        isActive(to)
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </Link>
                  ))}
              </div>
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground truncate max-w-[160px]">
              {user?.email}
            </span>
            <button
              onClick={() => signOut()}
              className="text-muted-foreground hover:text-foreground"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
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
