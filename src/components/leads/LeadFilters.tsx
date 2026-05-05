'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface ArchetypeMap {
  [key: string]: { label: string; color: string; icon: string }
}

/**
 * Client-side filter controls for the leads list.
 * Updates URL query params; the server component re-renders with the filtered query.
 *
 * Why URL-driven filters:
 *   - Bookmarkable / shareable
 *   - Back-button works
 *   - Server can keep doing the DB filter (no need to re-fetch in JS)
 */
export function LeadFilters({ archetypeLabels }: { archetypeLabels: ArchetypeMap }) {
  const router = useRouter()
  const params = useSearchParams()
  const currentStatus = params.get('status') ?? ''
  const currentArchetype = params.get('archetype') ?? ''
  const currentQ = params.get('q') ?? ''

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    router.push(`?${next.toString()}`)
  }

  // Debounced search via form submit + onBlur
  const onSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    updateParam('q', String(fd.get('q') ?? ''))
  }

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <form onSubmit={onSearchSubmit} className="relative flex-1">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          name="q"
          defaultValue={currentQ}
          placeholder="Buscar por nombre, empresa, email..."
          className="pl-9"
        />
      </form>

      <div className="flex gap-2">
        <select
          value={currentStatus}
          onChange={(e) => updateParam('status', e.target.value)}
          className="px-3 py-2 border rounded-md text-sm bg-background"
        >
          <option value="">Todos los estados</option>
          <option value="hot">Hot</option>
          <option value="warm">Warm</option>
          <option value="cold">Cold</option>
          <option value="converted">Convertidos</option>
        </select>
        <select
          value={currentArchetype}
          onChange={(e) => updateParam('archetype', e.target.value)}
          className="px-3 py-2 border rounded-md text-sm bg-background"
        >
          <option value="">Todos los arquetipos</option>
          {Object.entries(archetypeLabels).map(([key, { label }]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
