import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider, MutationCache } from "@tanstack/react-query";
import { ProfileProvider } from "@/contexts/ProfileContext";
import { Layout } from "@/components/Layout";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { Toaster } from "@/components/ui/Toaster";
import { toast } from "@/hooks/useToast";
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

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ProfileProvider>
        <BrowserRouter>
          <ErrorBoundary>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/campaigns" element={<Campaigns />} />
                <Route path="/campaigns/:id" element={<CampaignDetail />} />
                <Route path="/stories" element={<StoriesExplorer />} />
                <Route path="/stories/:id" element={<StoryDetail />} />
                <Route path="/content" element={<ContentLibrary />} />
                <Route path="/meetings" element={<MeetingsBrowser />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/quotes" element={<QuoteLibrary />} />
                <Route path="/calendar" element={<ContentCalendar />} />
              </Routes>
            </Layout>
          </ErrorBoundary>
        </BrowserRouter>
      </ProfileProvider>
      <Toaster />
    </QueryClientProvider>
  );
}
