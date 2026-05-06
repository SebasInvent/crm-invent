'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'

export type Product = {
  id: string
  slug: string
  name: string
  tagline?: string | null
  status: string
  color: string
  icon?: string | null
}

interface Props {
  /** URL param key — defaults to 'product' */
  paramKey?: string
  /** Filter to specific statuses — defaults to ['active','beta'] */
  showStatuses?: string[]
  /**
   * Optional: callback when selection changes. By default the picker
   * pushes the slug to ?product=slug in the current URL.
   */
  onChange?: (product: Product) => void
}

/**
 * Horizontal product chip picker. Reads the active product from the
 * URL (?product=slug) and on click pushes a new search param without
 * dropping the rest of the query string.
 *
 * Used at the top of /pipeline (and in the future /leads, /contacts,
 * /dashboard) so every list view can scope to one of Invent's
 * verticals.
 *
 * If no slug is in the URL the first active product gets selected
 * automatically (avoids an empty kanban on first load).
 */
export function ProductPicker({
  paramKey = 'product',
  showStatuses = ['active', 'beta'],
  onChange,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const current = search.get(paramKey) ?? ''

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['products', 'list'],
    queryFn: async () => {
      const res = await fetch('/api/products')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      return (json.products as Product[]) ?? []
    },
    staleTime: 5 * 60_000,
  })

  const visible = products.filter((p) => showStatuses.includes(p.status))

  // Auto-pick first active product when URL has no selection
  useEffect(() => {
    if (!current && visible.length > 0) {
      const first = visible[0]
      const params = new URLSearchParams(search.toString())
      params.set(paramKey, first.slug)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, visible.length])

  function pick(p: Product) {
    const params = new URLSearchParams(search.toString())
    params.set(paramKey, p.slug)
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
    onChange?.(p)
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-8 w-24 rounded-full bg-zinc-900 animate-pulse flex-shrink-0" />
        ))}
      </div>
    )
  }

  if (visible.length === 0) {
    return (
      <div className="text-xs text-zinc-500">
        No hay productos activos. Crea uno desde{' '}
        <span className="font-mono">POST /api/products</span>.
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
      {visible.map((p) => {
        const isActive = current === p.slug
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => pick(p)}
            className={[
              'group inline-flex items-center gap-2 h-8 px-3 rounded-full text-xs font-medium border transition-colors flex-shrink-0 snap-start',
              isActive
                ? 'border-transparent text-black'
                : 'border-zinc-800 text-zinc-300 hover:bg-zinc-900 hover:text-white',
            ].join(' ')}
            style={isActive ? { backgroundColor: p.color } : undefined}
            aria-pressed={isActive}
          >
            {p.icon && <span className="text-sm leading-none">{p.icon}</span>}
            <span className="truncate">{p.name}</span>
            {p.status === 'beta' && (
              <span
                className={[
                  'text-[9px] uppercase tracking-wider rounded px-1 py-px',
                  isActive ? 'bg-black/15 text-black/70' : 'bg-zinc-800 text-zinc-500',
                ].join(' ')}
              >
                beta
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
