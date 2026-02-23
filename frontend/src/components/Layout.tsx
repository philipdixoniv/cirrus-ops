import { Link, useLocation, Outlet } from "react-router-dom";
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
  Receipt,
  ShoppingCart,
  ChevronDown,
  Menu,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState, useEffect } from "react";
import { SearchBar } from "./SearchBar";
import { UserMenu } from "./UserMenu";
import { useProfile } from "@/contexts/ProfileContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";

type NavItem =
  | { type: "link"; to: string; label: string; icon: LucideIcon }
  | { type: "separator"; label: string };

const NAV_ITEMS: NavItem[] = [
  { type: "link", to: "/", label: "Dashboard", icon: LayoutDashboard },
  { type: "link", to: "/campaigns", label: "Campaigns", icon: Target },
  { type: "link", to: "/stories", label: "Stories", icon: BookOpen },
  { type: "link", to: "/content", label: "Content Library", icon: FileText },
  { type: "link", to: "/meetings", label: "Meetings", icon: Video },
  { type: "link", to: "/analytics", label: "Analytics", icon: BarChart3 },
  { type: "link", to: "/customer-quotes", label: "Customer Quotes", icon: Quote },
  { type: "link", to: "/calendar", label: "Calendar", icon: CalendarDays },
  { type: "separator", label: "Sales" },
  { type: "link", to: "/sales/quotes", label: "Quotes", icon: Receipt },
  { type: "link", to: "/sales/orders", label: "Orders", icon: ShoppingCart },
];

export function Layout() {
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { profiles, activeProfile, setActiveProfile } = useProfile();
  const { orgs, activeOrg, setActiveOrg } = useAuth();
  const queryClient = useQueryClient();

  // Close mobile sidebar on navigation
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const sidebarContent = (
    <>
      <div className="p-6 border-b">
        <h1 className="text-lg font-bold tracking-tight">Content Studio</h1>
        <p className="text-xs text-muted-foreground">Cirrus Ops</p>
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
              onChange={(e) => {
                const org = orgs.find((o) => o.id === e.target.value);
                if (org) {
                  setActiveOrg(org);
                  queryClient.invalidateQueries();
                }
              }}
              className="w-full text-sm border rounded-md px-3 py-1.5 bg-background appearance-none pr-8"
              aria-label="Select organization"
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
              aria-label="Select profile"
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
        {NAV_ITEMS.map((item, index) => {
          if (item.type === "separator") {
            return (
              <div key={`sep-${index}`} className="pt-4 pb-1 px-3">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {item.label}
                </span>
              </div>
            );
          }
          const { to, label, icon: Icon } = item;
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
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 border-r bg-card flex-col shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative w-64 h-full bg-card flex flex-col shadow-lg animate-in slide-in-from-left duration-200">
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-4 p-1 rounded hover:bg-accent"
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 border-b flex items-center justify-between px-4 md:px-6 bg-card shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-1.5 rounded hover:bg-accent transition-colors"
              aria-label="Open sidebar menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            {searchOpen ? (
              <SearchBar onClose={() => setSearchOpen(false)} />
            ) : (
              <button
                onClick={() => setSearchOpen(true)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Search stories and content"
              >
                <Search className="h-4 w-4" />
                <span className="hidden sm:inline">Search stories & content...</span>
                <kbd className="hidden sm:inline-flex ml-2 px-1.5 py-0.5 text-[10px] font-mono bg-muted border rounded">
                  {navigator.platform.includes("Mac") ? "\u2318" : "Ctrl"}K
                </kbd>
              </button>
            )}
          </div>
          <UserMenu />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6"><Outlet /></main>
      </div>
    </div>
  );
}
