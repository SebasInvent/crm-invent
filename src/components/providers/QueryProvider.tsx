'use client'

import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

/**
 * App-wide TanStack Query provider.
 *
 * Why useState (not module-level) for the QueryClient:
 *   - In a Next.js App Router app the layout is rendered on the server first,
 *     and on the client during hydration. A module-level QueryClient survives
 *     across renders BUT in dev with Fast Refresh it gets re-imported and the
 *     cache is silently shared across "users" in the same module instance —
 *     which is fine in practice but useState here is the canonical pattern
 *     recommended by the TanStack team.
 *
 * Sensible defaults:
 *   - staleTime: 30s — data is considered fresh enough that re-mounting a
 *     component (e.g. switching tabs in the dashboard) does NOT refetch. This
 *     is the single biggest perceptual upgrade over the old useEffect+fetch
 *     pattern: navigating between Contacts ↔ Pipeline ↔ Leads no longer shows
 *     skeleton screens for data we just loaded.
 *   - refetchOnWindowFocus: true — keeps data fresh when the user comes back
 *     to the tab. Cheap and feels alive.
 *   - retry: 1 — Supabase errors are usually deterministic (RLS, schema). One
 *     retry catches network blips without spamming on real failures.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
          mutations: {
            // Mutations should fail loud — let the toast in the page handle it.
            retry: 0,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={client}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      )}
    </QueryClientProvider>
  )
}
