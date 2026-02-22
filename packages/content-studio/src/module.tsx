/**
 * Content Studio micro-frontend module entry.
 * Exports mount/unmount for the shell to call.
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProfileProvider } from '@/contexts/ProfileContext'
import type { CirrusOpsContext, CirrusModule } from '@cirrus/shared'

// Lazy-loaded pages
import { Dashboard } from '@/pages/Dashboard'
import { StoriesExplorer } from '@/pages/StoriesExplorer'
import { StoryDetail } from '@/pages/StoryDetail'
import { ContentLibrary } from '@/pages/ContentLibrary'
import { MeetingsBrowser } from '@/pages/MeetingsBrowser'
import { Analytics } from '@/pages/Analytics'
import { QuoteLibrary } from '@/pages/QuoteLibrary'
import { ContentCalendar } from '@/pages/ContentCalendar'
import { Campaigns } from '@/pages/Campaigns'
import { CampaignDetail } from '@/pages/CampaignDetail'

import './globals.css'

let root: ReactDOM.Root | null = null

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

/** Map browser path to Content Studio internal path (strip /content prefix). */
function getInternalPath(): string {
  const path = window.location.pathname
  if (path.startsWith('/content')) {
    const internal = path.slice('/content'.length) || '/'
    return internal
  }
  return path
}

function ContentStudioApp() {
  const initialPath = getInternalPath()

  return (
    <QueryClientProvider client={queryClient}>
      <ProfileProvider>
        <MemoryRouter initialEntries={[initialPath]}>
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
        </MemoryRouter>
      </ProfileProvider>
    </QueryClientProvider>
  )
}

const contentStudioModule: CirrusModule = {
  async mount(container: HTMLElement, _context: CirrusOpsContext) {
    root = ReactDOM.createRoot(container)
    root.render(
      <React.StrictMode>
        <ContentStudioApp />
      </React.StrictMode>
    )
  },

  async unmount(_container: HTMLElement) {
    if (root) {
      root.unmount()
      root = null
    }
  },
}

export default contentStudioModule
