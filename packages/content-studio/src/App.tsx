import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { OrgProvider, useOrg } from "@/contexts/OrgContext";
import { ProfileProvider } from "@/contexts/ProfileContext";
import { AuthGuard } from "@/components/AuthGuard";
import { OrgGuard } from "@/components/OrgGuard";
import { StripeInstanceProvider } from "@/contexts/StripeInstanceContext";
import { Layout } from "@/components/Layout";
import { setAuthProvider } from "@/api/client";

// Pages — Content Studio
import { Dashboard } from "@/pages/Dashboard";
import { StoriesExplorer } from "@/pages/StoriesExplorer";
import { StoryDetail } from "@/pages/StoryDetail";
import { ContentLibrary } from "@/pages/ContentLibrary";
import { MeetingsBrowser } from "@/pages/MeetingsBrowser";
import { Analytics } from "@/pages/Analytics";
import { QuoteLibrary } from "@/pages/QuoteLibrary";
import { ContentCalendar } from "@/pages/ContentCalendar";
import { Campaigns } from "@/pages/Campaigns";
import { CampaignDetail } from "@/pages/CampaignDetail";

// Pages — Auth / Org
import { Login } from "@/pages/Login";
import { OrgCreate } from "@/pages/OrgCreate";

// Pages — RevOps (lazy-loaded placeholders until ported)
import { lazy, Suspense } from "react";

const Pipeline = lazy(() => import("@/pages/revops/Pipeline"));
const Orders = lazy(() => import("@/pages/revops/Orders"));
const OrderDetail = lazy(() => import("@/pages/revops/OrderDetail"));
const OpportunityDetail = lazy(() => import("@/pages/revops/OpportunityDetail"));
const AccountDetail = lazy(() => import("@/pages/revops/AccountDetail"));
const RevenueAnalytics = lazy(() => import("@/pages/revops/RevenueAnalytics"));
const QuoteCreate = lazy(() => import("@/pages/revops/QuoteCreate"));
const QuoteEdit = lazy(() => import("@/pages/revops/QuoteEdit"));
const SharedQuote = lazy(() => import("@/pages/revops/SharedQuote"));
const PaymentSuccess = lazy(() => import("@/pages/revops/PaymentSuccess"));
const PaymentCancel = lazy(() => import("@/pages/revops/PaymentCancel"));
const AdminProducts = lazy(() => import("@/pages/revops/AdminProducts"));
const AdminStripeSync = lazy(() => import("@/pages/revops/AdminStripeSync"));
const AdminTemplates = lazy(() => import("@/pages/revops/AdminTemplates"));
const AdminQuoteConfig = lazy(() => import("@/pages/revops/AdminQuoteConfig"));
const AdminSetup = lazy(() => import("@/pages/revops/AdminSetup"));
const StripeCompareSync = lazy(() => import("@/pages/revops/StripeCompareSync"));
const OrgSettings = lazy(() => import("@/pages/revops/OrgSettings"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function LazyFallback() {
  return (
    <div className="flex items-center justify-center h-64">
      <p className="text-gray-400 text-sm">Loading...</p>
    </div>
  );
}

/** Wires auth context into the API client module */
function AuthBridge() {
  const { session } = useAuth();
  const { activeOrgId } = useOrg();

  useEffect(() => {
    setAuthProvider(() => ({
      accessToken: session?.access_token ?? null,
      orgId: activeOrgId,
    }));
  }, [session, activeOrgId]);

  return null;
}

function AppRoutes() {
  return (
    <Suspense fallback={<LazyFallback />}>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/quote/share/:token" element={<SharedQuote />} />
        <Route path="/payment/success" element={<PaymentSuccess />} />
        <Route path="/payment/cancel" element={<PaymentCancel />} />

        {/* Org creation (auth required, no org required) */}
        <Route
          path="/org/new"
          element={
            <AuthGuard>
              <OrgCreate />
            </AuthGuard>
          }
        />

        {/* All app routes (auth + org required) */}
        <Route
          path="*"
          element={
            <AuthGuard>
              <OrgGuard>
                <Layout>
                  <Suspense fallback={<LazyFallback />}>
                    <Routes>
                      {/* Dashboard */}
                      <Route path="/" element={<Dashboard />} />

                      {/* Content Studio */}
                      <Route path="/campaigns" element={<Campaigns />} />
                      <Route path="/campaigns/:id" element={<CampaignDetail />} />
                      <Route path="/stories" element={<StoriesExplorer />} />
                      <Route path="/stories/:id" element={<StoryDetail />} />
                      <Route path="/content" element={<ContentLibrary />} />
                      <Route path="/meetings" element={<MeetingsBrowser />} />
                      <Route path="/analytics/content" element={<Analytics />} />
                      <Route path="/quotes" element={<QuoteLibrary />} />
                      <Route path="/calendar" element={<ContentCalendar />} />

                      {/* RevOps */}
                      <Route path="/pipeline" element={<Pipeline />} />
                      <Route path="/orders" element={<Orders />} />
                      <Route path="/orders/:id" element={<OrderDetail />} />
                      <Route path="/opportunity/:id" element={<OpportunityDetail />} />
                      <Route path="/account/:id" element={<AccountDetail />} />
                      <Route path="/analytics/revenue" element={<RevenueAnalytics />} />
                      <Route path="/quote/new" element={<QuoteCreate />} />
                      <Route path="/quote/:id/edit" element={<QuoteEdit />} />

                      {/* Admin */}
                      <Route path="/admin/products" element={<AdminProducts />} />
                      <Route path="/admin/stripe" element={<AdminStripeSync />} />
                      <Route path="/admin/stripe/compare" element={<StripeCompareSync />} />
                      <Route path="/admin/templates" element={<AdminTemplates />} />
                      <Route path="/admin/quote-config" element={<AdminQuoteConfig />} />
                      <Route path="/admin/setup" element={<AdminSetup />} />
                      <Route path="/org/settings" element={<OrgSettings />} />
                    </Routes>
                  </Suspense>
                </Layout>
              </OrgGuard>
            </AuthGuard>
          }
        />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <OrgProvider>
          <StripeInstanceProvider>
            <ProfileProvider>
              <BrowserRouter>
              <AuthBridge />
              <AppRoutes />
              </BrowserRouter>
            </ProfileProvider>
          </StripeInstanceProvider>
        </OrgProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
