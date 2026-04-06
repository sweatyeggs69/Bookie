import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'

import App from './App'
import './index.css'

// ─── React Query client ───────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is considered fresh for 30 seconds before a background refetch
      staleTime: 30 * 1000,
      // Keep cached data for 5 minutes (used by the sessionStorage persister)
      gcTime: 5 * 60 * 1000,
      // Only retry failed requests once before surfacing the error
      retry: 1,
      // Don't refetch on window focus — library data rarely changes externally
      refetchOnWindowFocus: false,
    },
    mutations: {
      // Don't retry mutations — side effects should not be retried silently
      retry: 0,
    },
  },
})

// Persist the cache to sessionStorage so books render instantly on page refresh
const persister = createSyncStoragePersister({
  storage: window.sessionStorage,
})

// ─── Mount ────────────────────────────────────────────────────────────────────

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root not found in the DOM.')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 5 * 60 * 1000 }}
    >
      <App />
    </PersistQueryClientProvider>
  </React.StrictMode>,
)
