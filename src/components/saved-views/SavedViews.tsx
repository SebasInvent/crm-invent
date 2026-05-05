'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { Bookmark, BookmarkPlus, Pin, Trash2, Loader2, Check } from 'lucide-react'

type SavedView = {
  id: string
  name: string
  filters: Record<string, string | number | boolean | null>
  is_pinned: boolean
}

interface Props {
  /** 'leads' | 'contacts' | 'deals' — must match server enum */
  entity: string
  /**
   * Param keys that are part of "filters" — anything else in the URL
   * (page=, sort=, etc.) is ignored when saving + restoring.
   */
  filterKeys: string[]
}

/**
 * Saved views — lets the user save the current set of URL filter
 * params under a name and recall them with one click.
 *
 * Two pieces in the toolbar:
 *   1. <Bookmark> dropdown that lists saved views (pinned first).
 *      Click → push the view's filters to the URL.
 *      Right-side icons → pin/unpin and delete.
 *   2. <BookmarkPlus> button → opens a tiny inline form to name and
 *      save the current URL state.
 */
export function SavedViews({ entity, filterKeys }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('')

  const queryKey = ['saved-views', entity]

  const { data, isLoading } = useQuery<{ views: SavedView[] }>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/saved-views?entity=${entity}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    staleTime: 60_000,
  })

  // Snapshot of the current URL filters (only the keys we care about)
  function currentFilters(): Record<string, string> {
    const obj: Record<string, string> = {}
    for (const k of filterKeys) {
      const v = searchParams.get(k)
      if (v != null && v !== '') obj[k] = v
    }
    return obj
  }

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch('/api/saved-views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity, name, filters: currentFilters() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      return json.view as SavedView
    },
    onSuccess: () => {
      setCreating(false)
      setDraftName('')
      qc.invalidateQueries({ queryKey })
      toast.success('Vista guardada')
    },
    onError: (err: Error) => {
      toast.error('No se pudo guardar', { description: err.message })
    },
  })

  const patchMutation = useMutation({
    mutationFn: async (input: { id: string; patch: Partial<SavedView> }) => {
      const res = await fetch(`/api/saved-views/${input.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input.patch),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      return json.view as SavedView
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: (err: Error) => toast.error('No se pudo actualizar', { description: err.message }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/saved-views/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error || `HTTP ${res.status}`)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey })
      toast.success('Vista eliminada')
    },
    onError: (err: Error) => toast.error('No se pudo eliminar', { description: err.message }),
  })

  function applyView(view: SavedView) {
    // Build a fresh URLSearchParams that only contains the saved view's
    // filter keys. Other params (sort etc.) are dropped — apply view
    // means "go to exactly this state".
    const usp = new URLSearchParams()
    for (const [k, v] of Object.entries(view.filters)) {
      if (v == null) continue
      usp.set(k, String(v))
    }
    const qs = usp.toString()
    router.push(qs ? `?${qs}` : '?')
  }

  const views = data?.views ?? []
  const hasFilters = Object.keys(currentFilters()).length > 0

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-900"
          >
            <Bookmark className="h-3.5 w-3.5 mr-1.5" />
            Vistas
            {views.length > 0 && (
              <span className="ml-1.5 text-[10px] text-zinc-500">({views.length})</span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="bg-zinc-950 border-zinc-800 text-white w-72"
        >
          <DropdownMenuLabel className="text-xs text-zinc-500 uppercase tracking-wider">
            Vistas guardadas
          </DropdownMenuLabel>
          {isLoading ? (
            <div className="px-3 py-4 flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
            </div>
          ) : views.length === 0 ? (
            <div className="px-3 py-3 text-xs text-zinc-500">
              Aún no tienes vistas. Aplica filtros y guárdalos para volver con un clic.
            </div>
          ) : (
            views.map((v) => (
              <DropdownMenuItem
                key={v.id}
                onSelect={(e) => {
                  e.preventDefault()
                  applyView(v)
                }}
                className="cursor-pointer focus:bg-zinc-900 group"
              >
                <div className="flex items-center justify-between gap-2 w-full">
                  <span className="flex items-center gap-2 truncate">
                    {v.is_pinned && <Pin className="h-3 w-3 text-amber-400 flex-shrink-0" />}
                    <span className="truncate">{v.name}</span>
                  </span>
                  <span className="hidden group-hover:flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        patchMutation.mutate({ id: v.id, patch: { is_pinned: !v.is_pinned } })
                      }}
                      aria-label={v.is_pinned ? 'Desfijar' : 'Fijar'}
                      className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-zinc-800 text-zinc-400"
                    >
                      <Pin className={`h-3 w-3 ${v.is_pinned ? 'text-amber-400' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (!window.confirm(`¿Eliminar la vista "${v.name}"?`)) return
                        deleteMutation.mutate(v.id)
                      }}
                      aria-label="Eliminar vista"
                      className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-zinc-800 text-zinc-400 hover:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                </div>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator className="bg-zinc-800" />
          <DropdownMenuItem
            disabled={!hasFilters}
            onSelect={(e) => {
              e.preventDefault()
              setCreating(true)
            }}
            className="cursor-pointer focus:bg-zinc-900 text-white disabled:opacity-50"
          >
            <BookmarkPlus className="h-3.5 w-3.5 mr-2" />
            {hasFilters ? 'Guardar filtros actuales…' : 'Aplica filtros primero'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Inline create form (renders next to the dropdown when open) */}
      {creating && (
        <div className="flex items-center gap-1.5">
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draftName.trim()) {
                createMutation.mutate(draftName.trim())
              }
              if (e.key === 'Escape') {
                setCreating(false)
                setDraftName('')
              }
            }}
            placeholder="Nombre de la vista"
            autoFocus
            className="h-8 w-44 bg-zinc-900 border-zinc-800 text-white text-sm"
          />
          <Button
            size="icon"
            disabled={!draftName.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate(draftName.trim())}
            className="h-8 w-8 bg-white text-black hover:bg-zinc-200"
            aria-label="Guardar vista"
          >
            {createMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
