'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Loader2, Users } from 'lucide-react'

export default function AcceptInvitePage({ params }: { params: { token: string } }) {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [authed, setAuthed] = useState(false)
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    const supabase = getAuthClient()
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace(`/login?redirect=${encodeURIComponent(`/invite/${params.token}`)}`)
        return
      }
      setAuthed(true)
      setChecking(false)
    })
  }, [params.token, router])

  async function accept() {
    setAccepting(true)
    try {
      const res = await fetch('/api/orgs/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: params.token }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'No se pudo aceptar la invitación')
        return
      }
      toast.success('¡Te uniste al workspace!')
      router.replace('/dashboard')
    } catch {
      toast.error('Error de red')
    } finally {
      setAccepting(false)
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-zinc-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="h-14 w-14 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto">
          <Users className="h-7 w-7 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Invitación a colaborar</h1>
          <p className="text-zinc-400 mt-2">Te invitaron a un workspace en el CRM. Acepta para unirte.</p>
        </div>
        {authed && (
          <Button className="bg-white text-black hover:bg-zinc-200 w-full" onClick={accept} disabled={accepting}>
            {accepting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Aceptar invitación
          </Button>
        )}
      </div>
    </div>
  )
}
