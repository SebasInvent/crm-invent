'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Send } from 'lucide-react'
import { EmailComposerDialog } from './EmailComposerDialog'

/**
 * Client island for the emails page header. Holds the "Nuevo Email"
 * button + the composer dialog state — kept separate from the
 * server-rendered page so the page itself can be RSC.
 */
export function EmailsHeader() {
  const [composerOpen, setComposerOpen] = useState(false)
  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white">Emails</h1>
          <p className="text-zinc-400 mt-1">Envía emails directos y revisa el historial</p>
        </div>
        <Button
          onClick={() => setComposerOpen(true)}
          className="bg-white text-black hover:bg-zinc-200"
        >
          <Send className="h-4 w-4 mr-2" />
          Nuevo Email
        </Button>
      </div>

      <EmailComposerDialog open={composerOpen} onOpenChange={setComposerOpen} />
    </>
  )
}
