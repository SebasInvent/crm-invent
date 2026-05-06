'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Plus, Mail } from 'lucide-react'
import { NewDealDialog } from '@/components/deals/NewDealDialog'

interface Props {
  contactId: string
  contactLabel: string
  contactEmail?: string | null
}

/**
 * Action toolbar for /dashboard/contacts/[id]. Mirrors LeadActionsBar
 * but scoped to actions that make sense from a contact:
 *   • + Nuevo Deal — locked to this contact
 *   • Enviar email — opens default mail client (mailto:) for now;
 *     will hook into the email composer once Block C lands
 */
export function ContactActionsBar({ contactId, contactLabel, contactEmail }: Props) {
  const [dealOpen, setDealOpen] = useState(false)

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

        {contactEmail && (
          <a href={`mailto:${contactEmail}`}>
            <Button
              size="sm"
              variant="outline"
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-900 h-8"
            >
              <Mail className="h-3.5 w-3.5 mr-1" />
              Enviar email
            </Button>
          </a>
        )}
      </div>

      <NewDealDialog
        open={dealOpen}
        onOpenChange={setDealOpen}
        lockedContactId={contactId}
        lockedContactLabel={contactLabel}
      />
    </>
  )
}
