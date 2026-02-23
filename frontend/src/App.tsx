import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { QueryClient, QueryClientProvider, MutationCache } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProfileProvider } from "@/contexts/ProfileContext";
import { Layout } from "@/components/Layout";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { Toaster } from "@/components/ui/Toaster";
import { toast } from "@/hooks/useToast";
import { Login } from "@/pages/Login";
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
import { SalesQuotes } from "@/pages/SalesQuotes";
import { SalesQuoteCreate } from "@/pages/SalesQuoteCreate";
import { SalesQuoteDetail } from "@/pages/SalesQuoteDetail";
import { SalesQuoteEdit } from "@/pages/SalesQuoteEdit";
import { Orders } from "@/pages/Orders";
import { OrderDetail } from "@/pages/OrderDetail";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
  mutationCache: new MutationCache({
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    },
    onSuccess: (_data, _variables, _context, mutation) => {
      const msg = (mutation.options.meta as { successMessage?: string } | undefined)?.successMessage;
      if (msg) toast.success(msg);
    },
  }),
});

function ProtectedRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ProfileProvider>
          <BrowserRouter>
            <ErrorBoundary>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route element={<ProtectedRoute />}>
                  <Route element={<Layout />}>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/campaigns" element={<Campaigns />} />
                    <Route path="/campaigns/:id" element={<CampaignDetail />} />
                    <Route path="/stories" element={<StoriesExplorer />} />
                    <Route path="/stories/:id" element={<StoryDetail />} />
                    <Route path="/content" element={<ContentLibrary />} />
                    <Route path="/meetings" element={<MeetingsBrowser />} />
                    <Route path="/analytics" element={<Analytics />} />
                    <Route path="/customer-quotes" element={<QuoteLibrary />} />
                    <Route path="/calendar" element={<ContentCalendar />} />
                    <Route path="/sales/quotes" element={<SalesQuotes />} />
                    <Route path="/sales/quotes/new" element={<SalesQuoteCreate />} />
                    <Route path="/sales/quotes/:id" element={<SalesQuoteDetail />} />
                    <Route path="/sales/quotes/:id/edit" element={<SalesQuoteEdit />} />
                    <Route path="/sales/orders" element={<Orders />} />
                    <Route path="/sales/orders/:id" element={<OrderDetail />} />
                  </Route>
                </Route>
              </Routes>
            </ErrorBoundary>
          </BrowserRouter>
        </ProfileProvider>
      </AuthProvider>
      <Toaster />
    </QueryClientProvider>
  );
}
