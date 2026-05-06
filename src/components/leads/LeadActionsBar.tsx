'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Plus, Calendar, UserCheck, Loader2 } from 'lucide-react'
import { NewDealDialog } from '@/components/deals/NewDealDialog'
import { FollowUpDialog } from '@/components/leads/FollowUpDialog'

interface Props {
  leadId: string
  leadName: string
  isConverted: boolean
  /**
   * If the lead has been linked to a contact (via the converted flow
   * or manual matching), Nuevo Deal locks to that contact. Otherwise
   * the dialog asks the user to pick a contact.
   */
  contactId?: string | null
  /** Existing follow-up so the dialog can pre-fill */
  currentFollowUp?: string | null
}

/**
 * Action toolbar for /dashboard/leads/[id]. Rendered above the right
 * column (Notes + Timeline). Three high-frequency actions:
 *   • + Nuevo Deal     — opens NewDealDialog
 *   • Convertir        — POST /api/leads/[id]/convert (creates client + project)
 *   • Programar follow-up — opens FollowUpDialog
 *
 * Once a lead is converted, the convert button hides and a subtle
 * "Convertido" indicator appears instead.
 */
export function LeadActionsBar({
  leadId,
  leadName,
  isConverted,
  contactId,
  currentFollowUp,
}: Props) {
  const router = useRouter()
  const [dealOpen, setDealOpen] = useState(false)
  const [followOpen, setFollowOpen] = useState(false)
  const [converting, setConverting] = useState(false)

  async function convert() {
    if (
      !window.confirm(
        `¿Convertir a "${leadName}" en cliente? Se creará un cliente nuevo y un proyecto inicial.`,
      )
    ) {
      return
    }
    setConverting(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/convert`, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)

      toast.success('Lead convertido a cliente', {
        description: json?.client?.name ? `Cliente: ${json.client.name}` : undefined,
      })
      router.refresh()
    } catch (err) {
      toast.error('No se pudo convertir', {
        description: err instanceof Error ? err.message : 'Intenta de nuevo.',
      })
    } finally {
      setConverting(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap rounded-lg border border-zinc-800 bg-zinc-950 p-2">
        <Button
          size="sm"
          onClick={() => setDealOpen(true)}
          className="bg-white text-black hover:bg-zinc-200 h-8"
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Nuevo deal
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => setFollowOpen(true)}
          className="border-zinc-700 text-zinc-300 hover:bg-zinc-900 h-8"
        >
          <Calendar className="h-3.5 w-3.5 mr-1" />
          {currentFollowUp ? 'Reagendar follow-up' : 'Programar follow-up'}
        </Button>

        <div className="flex-1" />

        {isConverted ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-400 px-2">
            <UserCheck className="h-3.5 w-3.5" />
            Ya convertido a cliente
          </span>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={convert}
            disabled={converting}
            className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 h-8"
          >
            {converting ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <UserCheck className="h-3.5 w-3.5 mr-1" />
            )}
            Convertir a cliente
          </Button>
        )}
      </div>

      <NewDealDialog
        open={dealOpen}
        onOpenChange={setDealOpen}
        lockedContactId={contactId ?? undefined}
        lockedContactLabel={contactId ? leadName : undefined}
      />
      <FollowUpDialog
        open={followOpen}
        onOpenChange={setFollowOpen}
        leadId={leadId}
        current={currentFollowUp}
        leadName={leadName}
      />
    </>
  )
}
