import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import App from './App'
import './index.css'

// ─── Service Worker registration & update check ───────────────────────────────

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(registration => {
    // On every page load (including refresh) probe the server for a new SW version
    registration.update();
  });

  // When a new SW takes control (after skipWaiting), reload once to apply fresh assets
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

// ─── React Query client ───────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is considered fresh for 30 seconds before a background refetch
      staleTime: 30 * 1000,
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

// ─── Mount ────────────────────────────────────────────────────────────────────

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root not found in the DOM.')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)
