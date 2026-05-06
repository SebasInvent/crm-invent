'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Plus, Mail } from 'lucide-react'
import { NewDealDialog } from '@/components/deals/NewDealDialog'
import { EmailComposerDialog } from '@/components/emails/EmailComposerDialog'

interface Props {
  contactId: string
  contactLabel: string
  contactEmail?: string | null
}

/**
 * Action toolbar for /dashboard/contacts/[id]:
 *   • + Nuevo Deal — locked to this contact
 *   • Enviar email — opens the EmailComposerDialog pre-filled with
 *     the contact's email + name. Sends via /api/emails (Resend).
 */
export function ContactActionsBar({ contactId, contactLabel, contactEmail }: Props) {
  const [dealOpen, setDealOpen] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)

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
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEmailOpen(true)}
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-900 h-8"
          >
            <Mail className="h-3.5 w-3.5 mr-1" />
            Enviar email
          </Button>
        )}
      </div>

      <NewDealDialog
        open={dealOpen}
        onOpenChange={setDealOpen}
        lockedContactId={contactId}
        lockedContactLabel={contactLabel}
      />
      {contactEmail && (
        <EmailComposerDialog
          open={emailOpen}
          onOpenChange={setEmailOpen}
          defaultTo={contactEmail}
          defaultRecipientName={contactLabel}
          contactId={contactId}
        />
      )}
    </>
  )
}
