'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  CheckCircle,
  XCircle,
  Pause,
  Play,
  Trash2,
  Loader2,
  type LucideIcon,
} from 'lucide-react'

interface Props {
  dealId: string
  dealName: string
  status: string
}

/**
 * Inline action toolbar for the deal detail page. Lets the user mark
 * won/lost/paused/reopen + delete from a single row of buttons,
 * without opening any modal except for delete confirmation.
 *
 * Each button hits PATCH /api/deals/[id] which auto-records the
 * appropriate activity_log entry (deal_won, deal_lost, etc.) thanks
 * to the smart audit logic in the route.
 */
export function DealActionsBar({ dealId, dealName, status }: Props) {
  const router = useRouter()
  const [pending, setPending] = useState<string | null>(null)

  async function patch(body: Record<string, unknown>, label: string, successMsg: string) {
    setPending(label)
    try {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      toast.success(successMsg)
      router.refresh()
    } catch (err) {
      toast.error(`No se pudo aplicar ${label}`, {
        description: err instanceof Error ? err.message : 'Intenta de nuevo.',
      })
    } finally {
      setPending(null)
    }
  }

  async function destroy() {
    if (!window.confirm(`¿Eliminar el deal "${dealName}"? Esta acción no se puede deshacer.`)) {
      return
    }
    setPending('Eliminar')
    try {
      const res = await fetch(`/api/deals/${dealId}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      toast.success('Deal eliminado')
      router.push('/dashboard/pipeline')
    } catch (err) {
      toast.error('No se pudo eliminar', {
        description: err instanceof Error ? err.message : 'Intenta de nuevo.',
      })
      setPending(null)
    }
  }

  const isOpen = status === 'open'
  const isPaused = status === 'paused'
  const isClosed = status === 'won' || status === 'lost'

  return (
    <div className="flex items-center gap-2 flex-wrap rounded-lg border border-zinc-800 bg-zinc-950 p-2">
      {!isClosed && (
        <ActionButton
          icon={CheckCircle}
          label="Marcar como ganado"
          color="emerald"
          disabled={!!pending}
          loading={pending === 'Ganar'}
          onClick={() =>
            patch(
              { status: 'won', actual_close_date: new Date().toISOString().slice(0, 10) },
              'Ganar',
              `Deal ganado: ${dealName}`,
            )
          }
        />
      )}
      {!isClosed && (
        <ActionButton
          icon={XCircle}
          label="Marcar como perdido"
          color="red"
          disabled={!!pending}
          loading={pending === 'Perder'}
          onClick={() =>
            patch(
              { status: 'lost', actual_close_date: new Date().toISOString().slice(0, 10) },
              'Perder',
              `Deal marcado como perdido: ${dealName}`,
            )
          }
        />
      )}
      {isOpen && (
        <ActionButton
          icon={Pause}
          label="Pausar"
          color="amber"
          disabled={!!pending}
          loading={pending === 'Pausar'}
          onClick={() => patch({ status: 'paused' }, 'Pausar', 'Deal pausado')}
        />
      )}
      {isPaused && (
        <ActionButton
          icon={Play}
          label="Reanudar"
          color="sky"
          disabled={!!pending}
          loading={pending === 'Reanudar'}
          onClick={() => patch({ status: 'open' }, 'Reanudar', 'Deal reactivado')}
        />
      )}
      {isClosed && (
        <ActionButton
          icon={Play}
          label="Reabrir"
          color="sky"
          disabled={!!pending}
          loading={pending === 'Reabrir'}
          onClick={() =>
            patch(
              { status: 'open', actual_close_date: null },
              'Reabrir',
              'Deal reabierto',
            )
          }
        />
      )}

      <div className="flex-1" />

      <Button
        size="sm"
        variant="outline"
        disabled={!!pending}
        onClick={destroy}
        className="border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300 h-8"
      >
        {pending === 'Eliminar' ? (
          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5 mr-1" />
        )}
        Eliminar
      </Button>
    </div>
  )
}

const COLOR_CLASSES: Record<string, string> = {
  emerald: 'border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300',
  red: 'border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300',
  amber: 'border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300',
  sky: 'border-sky-500/40 text-sky-400 hover:bg-sky-500/10 hover:text-sky-300',
}

function ActionButton({
  icon: Icon,
  label,
  color,
  disabled,
  loading,
  onClick,
}: {
  icon: LucideIcon
  label: string
  color: keyof typeof COLOR_CLASSES
  disabled: boolean
  loading: boolean
  onClick: () => void
}) {
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={disabled}
      onClick={onClick}
      className={`${COLOR_CLASSES[color]} h-8`}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
      ) : (
        <Icon className="h-3.5 w-3.5 mr-1" />
      )}
      {label}
    </Button>
  )
}
