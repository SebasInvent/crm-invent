'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import {
  Mail,
  Phone,
  ArrowRight,
  Flame,
  Thermometer,
  Snowflake,
  Skull,
  CheckCircle,
  X,
  Trash2,
  Archive,
  Loader2,
  type LucideIcon,
} from 'lucide-react'

type Lead = {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  industry: string | null
  tags: string[] | null
  lead_score: number
  lead_status: 'hot' | 'warm' | 'cold' | 'dead' | 'converted'
  priority: 'critical' | 'high' | 'medium' | 'low'
}

const STATUS_CONFIG: Record<string, { label: string; color: string; Icon: LucideIcon }> = {
  hot: { label: 'Hot', color: 'bg-red-100 text-red-800 border-red-200', Icon: Flame },
  warm: { label: 'Warm', color: 'bg-yellow-100 text-yellow-800 border-yellow-200', Icon: Thermometer },
  cold: { label: 'Cold', color: 'bg-blue-100 text-blue-800 border-blue-200', Icon: Snowflake },
  dead: { label: 'Dead', color: 'bg-gray-100 text-gray-800 border-gray-200', Icon: Skull },
  converted: { label: 'Cliente', color: 'bg-green-100 text-green-800 border-green-200', Icon: CheckCircle },
}

const PRIORITY_BADGES: Record<string, string> = {
  critical: 'bg-red-500 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-white',
  low: 'bg-gray-500 text-white',
}

interface Props {
  leads: Lead[]
}

/**
 * Client-side leads table with multi-select + bulk actions.
 *
 * Selection is local state. Clicking the header checkbox toggles all
 * visible rows. A floating action bar appears at the bottom of the
 * viewport when at least one lead is selected, with: change status,
 * archive, delete.
 *
 * Bulk operations call /api/leads/bulk and on success reload the
 * route via router.refresh() (the listing is server-rendered, so
 * this re-renders with fresh data).
 */
export function LeadsTable({ leads }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<string | null>(null) // current action label

  const allIds = useMemo(() => leads.map((l) => l.id), [leads])
  const allSelected = selected.size > 0 && selected.size === allIds.length
  const someSelected = selected.size > 0 && selected.size < allIds.length

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds))
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSelection() {
    setSelected(new Set())
  }

  async function runBulk(
    body: Record<string, unknown>,
    successLabel: string,
    actionLabel: string,
  ) {
    setPending(actionLabel)
    try {
      const res = await fetch('/api/leads/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      toast.success(`${successLabel}: ${data.affected} leads`)
      clearSelection()
      router.refresh()
    } catch (err) {
      toast.error('No se pudo aplicar la acción', {
        description: err instanceof Error ? err.message : 'Intenta de nuevo.',
      })
    } finally {
      setPending(null)
    }
  }

  const ids = Array.from(selected)

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="w-10 py-3 px-3">
                <Checkbox
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  onCheckedChange={toggleAll}
                  aria-label="Seleccionar todos"
                />
              </th>
              <th className="text-left py-3 px-4 font-medium">Lead</th>
              <th className="text-left py-3 px-4 font-medium">Producto</th>
              <th className="text-left py-3 px-4 font-medium">Score</th>
              <th className="text-left py-3 px-4 font-medium">Estado</th>
              <th className="text-left py-3 px-4 font-medium">Prioridad</th>
              <th className="text-left py-3 px-4 font-medium">Cadencia</th>
              <th className="text-left py-3 px-4 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => {
              const status = STATUS_CONFIG[lead.lead_status] ?? STATUS_CONFIG.cold
              const product = lead.tags?.includes('tickean') ? 'Tickean' : lead.tags?.includes('encore') ? 'Encore' : 'General'
              const isSelected = selected.has(lead.id)
              return (
                <tr
                  key={lead.id}
                  className={`border-b hover:bg-muted/50 ${isSelected ? 'bg-muted/30' : ''}`}
                >
                  <td className="py-3 px-3">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleOne(lead.id)}
                      aria-label={`Seleccionar ${lead.name}`}
                    />
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-semibold">
                        {lead.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">{lead.name}</p>
                        <p className="text-sm text-muted-foreground">{lead.company}</p>
                        {lead.industry && (
                          <Badge variant="outline" className="text-xs mt-1">
                            {lead.industry}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <Badge variant="outline">{product}</Badge>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full"
                          style={{ width: `${lead.lead_score}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium">{lead.lead_score}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <Badge variant="outline" className={status.color}>
                      <status.Icon className="h-3 w-3 mr-1" />
                      {status.label}
                    </Badge>
                  </td>
                  <td className="py-3 px-4">
                    <Badge className={PRIORITY_BADGES[lead.priority] ?? PRIORITY_BADGES.low}>
                      {lead.priority}
                    </Badge>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-sm text-muted-foreground">
                      {lead.lead_status === 'cold'
                        ? 'Aprobar contacto'
                        : lead.lead_status === 'warm'
                          ? 'Seguimiento 48h'
                          : lead.lead_status === 'hot'
                            ? 'Hoy (24h)'
                            : '-'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex gap-1">
                      <Link href={`/dashboard/leads/${lead.id}`}>
                        <Button variant="ghost" size="sm">
                          Ver
                          <ArrowRight className="h-4 w-4 ml-1" />
                        </Button>
                      </Link>
                      {lead.email && (
                        <a href={`mailto:${lead.email}`}>
                          <Button variant="ghost" size="icon">
                            <Mail className="h-4 w-4" />
                          </Button>
                        </a>
                      )}
                      {lead.phone && (
                        <a href={`tel:${lead.phone}`}>
                          <Button variant="ghost" size="icon">
                            <Phone className="h-4 w-4" />
                          </Button>
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Floating action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[min(92vw,720px)] animate-in slide-in-from-bottom-4 fade-in duration-150">
          <div className="rounded-2xl border border-zinc-700 bg-zinc-900/95 backdrop-blur shadow-2xl px-4 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-sm text-white font-medium">
              {selected.size} lead{selected.size > 1 ? 's' : ''} seleccionados
            </span>

            <div className="flex-1" />

            {/* Status quick-changes */}
            <div className="flex items-center gap-1 flex-wrap">
              {(['hot', 'warm', 'cold'] as const).map((s) => {
                const meta = STATUS_CONFIG[s]
                return (
                  <Button
                    key={s}
                    size="sm"
                    variant="outline"
                    disabled={!!pending}
                    onClick={() =>
                      runBulk(
                        { action: 'change_status', ids, value: s },
                        `Marcados como ${meta.label}`,
                        `→ ${meta.label}`,
                      )
                    }
                    className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 h-8"
                  >
                    <meta.Icon className="h-3 w-3 mr-1" />
                    {meta.label}
                  </Button>
                )
              })}
            </div>

            <div className="h-6 w-px bg-zinc-800" />

            <Button
              size="sm"
              variant="outline"
              disabled={!!pending}
              onClick={() =>
                runBulk({ action: 'archive', ids }, 'Archivados', 'Archivar')
              }
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 h-8"
            >
              <Archive className="h-3 w-3 mr-1" />
              Archivar
            </Button>

            <Button
              size="sm"
              variant="outline"
              disabled={!!pending}
              onClick={() => {
                if (
                  !window.confirm(
                    `¿Eliminar permanentemente ${selected.size} lead${selected.size > 1 ? 's' : ''}? No se puede deshacer.`,
                  )
                )
                  return
                runBulk({ action: 'delete', ids }, 'Eliminados', 'Eliminar')
              }}
              className="border-red-500/40 text-red-400 hover:bg-red-500/10 h-8"
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Eliminar
            </Button>

            <Button
              size="icon"
              variant="ghost"
              disabled={!!pending}
              onClick={clearSelection}
              aria-label="Limpiar selección"
              className="h-8 w-8 text-zinc-400 hover:text-white"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            </Button>
          </div>
          {pending && (
            <div className="text-center text-xs text-zinc-500 mt-2">
              Aplicando: {pending}…
            </div>
          )}
        </div>
      )}
    </>
  )
}
