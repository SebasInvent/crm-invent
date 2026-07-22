'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getAuthClient } from '@/lib/supabase-auth'
import { useSupabaseQuery, useSupabaseMutation } from '@/lib/hooks/useSupabaseQuery'
import { Send, Loader2, MessageCircle, Bot, User, Phone, WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'

export type WaMessage = {
  id: string
  thread_id: string | null
  phone: string
  direction: 'inbound' | 'outbound'
  sender: 'customer' | 'bot' | 'human'
  content: string
  metadata?: { delivery_status?: string } | null
  created_at: string
}

export type WaThread = {
  id: string
  phone: string
  bot_active?: boolean
  status?: string
} | null

function digitsOf(p: string): string {
  return (p || '').replace(/\D/g, '')
}

/**
 * Histórico de WhatsApp del contacto, embebido en su ficha.
 *
 * - Lee `chat_messages` por los últimos 10 dígitos del teléfono (tolera el
 *   prefijo país 57 de Colombia y formatos con espacios/guiones).
 * - Se actualiza en vivo vía Supabase Realtime (ya habilitado en migración 002).
 * - Responde reutilizando POST /api/whatsapp/send (persiste + Evolution API).
 */
export function ContactConversation({
  contactPhone,
  contactName,
  initialThread,
  initialMessages,
  readOnly = false,
}: {
  contactPhone: string | null
  contactName: string | null
  initialThread: WaThread
  initialMessages: WaMessage[]
  readOnly?: boolean
}) {
  const digits = digitsOf(contactPhone || '')
  const match = digits.length >= 10 ? digits.slice(-10) : digits

  const supabase = useMemo(() => getAuthClient(), [])
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')
  const [realtime, setRealtime] = useState<'connecting' | 'live' | 'offline'>('connecting')
  const endRef = useRef<HTMLDivElement>(null)
  const msgKey = useMemo(() => ['contact-whatsapp', 'messages', match], [match])

  const { data: messages = [], isLoading } = useSupabaseQuery<WaMessage[]>({
    queryKey: msgKey,
    queryFn: () =>
      supabase
        .from('chat_messages')
        .select('*')
        .like('phone', `%${match}`)
        .order('created_at', { ascending: true }) as unknown as Promise<{
        data: WaMessage[] | null
        error: { message: string } | null
      }>,
    enabled: !!match,
    initialData: initialMessages,
  })

  // Auto-scroll al fondo cuando llegan mensajes
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Realtime: append a la caché de React Query (filtra por teléfono en el handler)
  useEffect(() => {
    if (!match) return
    setRealtime('connecting')
    const channel = supabase
      .channel(`contact_wa_${match}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const m = payload.new as WaMessage
          if (!m.phone || !m.phone.endsWith(match)) return
          queryClient.setQueryData<WaMessage[]>(msgKey, (prev) => {
            const list = prev ?? []
            if (list.find((x) => x.id === m.id)) return list
            // Reemplaza el mensaje optimista temporal del mismo contenido
            const withoutTemp = list.filter(
              (x) =>
                !(
                  x.id.startsWith('temp-') &&
                  x.content === m.content &&
                  x.direction === m.direction
                ),
            )
            return [...withoutTemp, m]
          })
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtime('live')
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED')
          setRealtime('offline')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, match, queryClient, msgKey])

  const sendMutation = useSupabaseMutation<{ text: string }, void>({
    mutationFn: async ({ text }) => {
      const sendPhone =
        initialThread?.phone || (digits.length === 10 ? `57${digits}` : digits)
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: sendPhone, text, threadId: initialThread?.id }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    },
    errorMessage: 'No se pudo enviar el mensaje',
  })

  function send() {
    const text = draft.trim()
    if (!text || sendMutation.isPending) return
    setDraft('')
    const optimistic: WaMessage = {
      id: 'temp-' + Date.now(),
      thread_id: initialThread?.id ?? null,
      phone: digits,
      direction: 'outbound',
      sender: 'human',
      content: text,
      created_at: new Date().toISOString(),
    }
    queryClient.setQueryData<WaMessage[]>(msgKey, (prev) => [...(prev ?? []), optimistic])
    sendMutation.mutate(
      { text },
      {
        onError: () => {
          queryClient.setQueryData<WaMessage[]>(
            msgKey,
            (prev) => prev?.filter((m) => m.id !== optimistic.id) ?? prev,
          )
          setDraft(text)
        },
      },
    )
  }

  if (!digits) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-950">
        <EmptyState
          icon={Phone}
          title="Sin teléfono"
          description="Agrega un teléfono a este contacto para ver y responder su conversación de WhatsApp."
        />
      </div>
    )
  }

  const sending = sendMutation.isPending

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-zinc-900 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10">
            <MessageCircle className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-white">WhatsApp</div>
            <div className="font-mono text-[11px] text-zinc-500">+{digits}</div>
          </div>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wider',
            realtime === 'live'
              ? 'bg-emerald-500/10 text-emerald-400'
              : realtime === 'connecting'
                ? 'bg-amber-500/10 text-amber-400'
                : 'bg-red-500/10 text-red-400',
          )}
        >
          {realtime === 'live' ? (
            <>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              Live
            </>
          ) : realtime === 'connecting' ? (
            <>
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              Conn
            </>
          ) : (
            <>
              <WifiOff className="h-2.5 w-2.5" />
              Off
            </>
          )}
        </span>
      </div>

      {/* Mensajes */}
      <div className="max-h-[420px] min-h-[200px] flex-1 space-y-2.5 overflow-y-auto p-4">
        {isLoading && messages.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-sm text-zinc-600">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando...
          </div>
        ) : messages.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title="Sin conversación todavía"
            description={
              readOnly
                ? `Aún no hay mensajes de WhatsApp con ${contactName || 'este contacto'}.`
                : `Aún no se ha registrado ningún mensaje enviado o recibido con ${contactName || 'este contacto'}. La conversación aparecerá aquí desde el primer envío o respuesta.`
            }
          />
        ) : (
          messages.map((m) => <Bubble key={m.id} m={m} />)
        )}
        <div ref={endRef} />
      </div>

      {!readOnly && (
        <div className="border-t border-zinc-900 p-3">
          <div className="flex items-end gap-2 rounded-xl border border-zinc-800 bg-black p-2 transition-colors focus-within:border-zinc-700">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder="Escribir mensaje de WhatsApp..."
              rows={1}
              className="max-h-28 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-white placeholder-zinc-600 focus:outline-none"
            />
            <button
              onClick={send}
              disabled={!draft.trim() || sending}
              className="rounded-lg bg-emerald-500 p-2 text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Bubble({ m }: { m: WaMessage }) {
  const isOutbound = m.direction === 'outbound'
  const isHuman = m.sender === 'human'
  const isBot = m.sender === 'bot'
  const deliveryLabel: Record<string, string> = {
    accepted: 'Aceptado por Meta',
    sent: 'Enviado',
    delivered: 'Entregado',
    read: 'Leído',
    failed: 'Falló',
  }
  const deliveryStatus = m.metadata?.delivery_status
  return (
    <div className={cn('flex', isOutbound ? 'justify-end' : 'justify-start')}>
      <div className="max-w-[78%]">
        <div
          className={cn(
            'whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm',
            isOutbound
              ? isHuman
                ? 'rounded-br-sm bg-emerald-600 text-white'
                : 'rounded-br-sm bg-blue-600 text-white'
              : 'rounded-bl-sm bg-zinc-900 text-zinc-100',
          )}
        >
          {m.content}
        </div>
        <div
          className={cn(
            'mt-1 flex items-center gap-1 text-[10px] text-zinc-600',
            isOutbound ? 'justify-end' : 'justify-start',
          )}
        >
          {isBot && <Bot className="h-3 w-3" />}
          {isHuman && <User className="h-3 w-3" />}
          <span>
            {isBot ? 'Bot' : isHuman ? 'Tú' : 'Cliente'} ·{' '}
            {new Date(m.created_at).toLocaleTimeString('es-CO', {
              hour: '2-digit',
              minute: '2-digit',
            })}
            {isOutbound && deliveryStatus ? ` · ${deliveryLabel[deliveryStatus] || deliveryStatus}` : ''}
          </span>
        </div>
      </div>
    </div>
  )
}
