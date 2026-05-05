'use client'

import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryKey,
  type UseQueryOptions,
  type UseMutationOptions,
} from '@tanstack/react-query'
import { toast } from 'sonner'

/**
 * Thin wrappers around TanStack Query that bake in:
 *   1. The shape of a Supabase response (`{ data, error }` → throw on error)
 *   2. Default toast handling on mutation errors so pages don't all repeat
 *      the same try/catch boilerplate
 *
 * The key insight: with React Query, the page-level "loading" state is
 * just `isLoading`/`isPending` from the hook, and "error" is `error`. No
 * more manual `useState(true)` + `useEffect`+ `setLoading(false)` —
 * which was leaking everywhere in the dashboard.
 */

type SupabaseQueryFn<T> = () => Promise<{ data: T | null; error: { message: string } | null }>

/**
 * Wrap a Supabase query so React Query handles the loading/error/cache.
 *
 * Usage:
 *   const { data, isLoading, refetch } = useSupabaseQuery({
 *     queryKey: ['contacts', filterType],
 *     queryFn: () => supabase.from('contacts').select('*'),
 *   })
 *
 * Returns `data` typed as `T` (not `T | null`) — we throw on error and
 * coerce null to []/{} at the call site if needed.
 */
export function useSupabaseQuery<T>(opts: {
  queryKey: QueryKey
  queryFn: SupabaseQueryFn<T>
  enabled?: boolean
  staleTime?: number
  refetchInterval?: number
  initialData?: T
}) {
  const reactQueryOpts: UseQueryOptions<T, Error> = {
    queryKey: opts.queryKey,
    queryFn: async () => {
      const { data, error } = await opts.queryFn()
      if (error) throw new Error(error.message)
      return data as T
    },
    enabled: opts.enabled,
    staleTime: opts.staleTime,
    refetchInterval: opts.refetchInterval,
  }
  if (opts.initialData !== undefined) {
    reactQueryOpts.initialData = opts.initialData
  }
  return useQuery(reactQueryOpts)
}

/**
 * Mutation wrapper that:
 *   - Surfaces the supabase error message in a sonner toast
 *   - Optionally invalidates a list of query keys on success
 *   - Optionally shows a success toast
 */
export function useSupabaseMutation<TInput, TOutput>(opts: {
  mutationFn: (input: TInput) => Promise<TOutput>
  invalidateKeys?: QueryKey[]
  successMessage?: string | ((output: TOutput, input: TInput) => string)
  errorMessage?: string
  onSuccess?: (output: TOutput, input: TInput) => void
} & Omit<UseMutationOptions<TOutput, Error, TInput>, 'mutationFn' | 'onSuccess' | 'onError'>) {
  const qc = useQueryClient()

  return useMutation<TOutput, Error, TInput>({
    ...opts,
    mutationFn: opts.mutationFn,
    onSuccess: (data, input) => {
      // Invalidate related queries so the UI refetches with fresh data
      if (opts.invalidateKeys) {
        for (const key of opts.invalidateKeys) {
          qc.invalidateQueries({ queryKey: key })
        }
      }
      if (opts.successMessage) {
        const msg =
          typeof opts.successMessage === 'function'
            ? opts.successMessage(data, input)
            : opts.successMessage
        toast.success(msg)
      }
      opts.onSuccess?.(data, input)
    },
    onError: (error) => {
      console.error('Mutation failed:', error)
      toast.error(opts.errorMessage ?? 'Algo salió mal', {
        description: error.message,
      })
    },
  })
}

/**
 * Centralized query key factory — keeps cache invalidation honest.
 * Whenever you add a new entity, add it here so all pages reference the
 * same key instead of stringly-typed copies floating around.
 */
export const queryKeys = {
  contacts: {
    all: ['contacts'] as const,
    list: (filter?: string) => ['contacts', 'list', filter ?? 'all'] as const,
    detail: (id: string) => ['contacts', 'detail', id] as const,
  },
  leads: {
    all: ['leads'] as const,
    list: (filters?: Record<string, unknown>) => ['leads', 'list', filters ?? {}] as const,
    detail: (id: string) => ['leads', 'detail', id] as const,
  },
  pipeline: {
    stages: ['pipeline', 'stages'] as const,
    deals: ['pipeline', 'deals'] as const,
    contacts: ['pipeline', 'contacts'] as const,
  },
  inbox: {
    conversations: ['inbox', 'conversations'] as const,
    channels: ['inbox', 'channels'] as const,
    templates: ['inbox', 'templates'] as const,
    messages: (conversationId: string) => ['inbox', 'messages', conversationId] as const,
  },
  conversaciones: {
    threads: ['conversaciones', 'threads'] as const,
    messages: (threadId: string) => ['conversaciones', 'messages', threadId] as const,
  },
  clients: {
    all: ['clients'] as const,
    detail: (id: string) => ['clients', 'detail', id] as const,
  },
} as const
