'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { getAuthClient } from '@/lib/supabase-auth'
import { Send, Bot, User, Pause, Play, Phone, Search, MessageCircle, Sparkles, CheckCircle2, Loader2, RefreshCw, Wifi, WifiOff, ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'
import {
  useSupabaseQuery,
  useSupabaseMutation,
  queryKeys,
} from '@/lib/hooks/useSupabaseQuery'
import {
  formatWhatsAppNumber,
  senderLineLabel,
  useWhatsAppLines,
  type WhatsAppLineId,
  type WhatsAppSenderMetadata,
} from '@/lib/hooks/useWhatsAppLines'

type Thread = {
  id: string
  phone: string
  contact_name: string | null
  bot_type: string
  bot_active: boolean
  status: string
  last_message_preview: string | null
  last_message_at: string
  lead_id: string | null
  metadata?: WhatsAppSenderMetadata | null
}

type Message = {
  id: string
  thread_id: string
  direction: 'inbound' | 'outbound'
  sender: 'customer' | 'bot' | 'human'
  content: string
  metadata?: WhatsAppSenderMetadata | null
  created_at: string
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-blue-500',
  qualified: 'bg-orange-500',
  closed: 'bg-emerald-500',
  cold: 'bg-zinc-600',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  qualified: 'Calificado',
  closed: 'Cerrado',
  cold: 'Frío',
}

export default function ConversationsView({ initialThreads }: { initialThreads: Thread[] }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialThreads[0]?.id || null)
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'live' | 'offline'>('connecting')
  const [unreadCount, setUnreadCount] = useState(0)
  const [selectedLineId, setSelectedLineId] = useState<WhatsAppLineId | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = useMemo(() => getAuthClient(), [])
  const { data: lineConfig, isLoading: loadingLines } = useWhatsAppLines()

  // ─── Threads list. Hydrates with `initialThreads` from server (instant
  //     paint) and React Query keeps it fresh in the background.
  const { data: threads = [], isFetching: refreshing, refetch: refetchThreads } =
    useSupabaseQuery<Thread[]>({
      queryKey: queryKeys.conversaciones.threads,
      queryFn: () =>
        supabase
          .from('chat_threads')
          .select('*')
          .order('last_message_at', { ascending: false })
          .limit(100) as unknown as Promise<{ data: Thread[] | null; error: { message: string } | null }>,
      initialData: initialThreads,
    })

  const activeThread = threads.find((t) => t.id === activeThreadId) || null
  const selectedLine = lineConfig?.lines.find((line) => line.id === selectedLineId) || null

  useEffect(() => {
    if (!lineConfig) return
    const threadLineId = activeThread?.metadata?.sender_line_id
    const preferred = lineConfig.lines.find(
      (line) => line.enabled && line.id === threadLineId,
    )
    const fallback = lineConfig.lines.find(
      (line) => line.enabled && line.id === lineConfig.defaultLineId,
    ) || lineConfig.lines.find((line) => line.enabled)
    setSelectedLineId(preferred?.id || fallback?.id || null)
  }, [activeThread?.id, activeThread?.metadata?.sender_line_id, lineConfig])

  // ─── Messages for the active thread. Disabled when no thread selected.
  const { data: messages = [], isLoading: loadingMessages } = useSupabaseQuery<Message[]>({
    queryKey: activeThreadId
      ? queryKeys.conversaciones.messages(activeThreadId)
      : ['conversaciones', 'messages', 'none'],
    queryFn: () =>
      supabase
        .from('chat_messages')
        .select('*')
        .eq('thread_id', activeThreadId!)
        .order('created_at', { ascending: true }) as unknown as Promise<{ data: Message[] | null; error: { message: string } | null }>,
    enabled: !!activeThreadId,
  })

  // Auto-scroll al fondo cuando llegan mensajes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ─── Realtime subscriptions: mutate the cache in place instead of
  //     duplicating state. Single source of truth = the React Query cache.
  useEffect(() => {
    setRealtimeStatus('connecting')

    const messagesChannel = supabase
      .channel('chat_messages_changes_v2')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const newMsg = payload.new as Message
          if (!newMsg?.id) return
          // Append to the cached messages list for that thread
          queryClient.setQueryData<Message[]>(
            queryKeys.conversaciones.messages(newMsg.thread_id),
            (prev) => {
              if (!prev) return [newMsg]
              if (payload.eventType === 'UPDATE') {
                return prev.map((message) => message.id === newMsg.id ? newMsg : message)
              }
              if (prev.find((m) => m.id === newMsg.id)) return prev
              const withoutOptimistic = prev.filter(
                (message) =>
                  !(
                    message.id.startsWith('temp-') &&
                    message.direction === newMsg.direction &&
                    message.content === newMsg.content &&
                    message.metadata?.sender_line_id === newMsg.metadata?.sender_line_id
                  ),
              )
              return [...withoutOptimistic, newMsg]
            },
          )
          // Bump unread counter only for inbound messages on inactive threads
          if (
            payload.eventType === 'INSERT' &&
            newMsg.thread_id !== activeThreadId &&
            newMsg.direction === 'inbound'
          ) {
            setUnreadCount((n) => n + 1)
          }
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('live')
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setRealtimeStatus('offline')
      })

    const threadsChannel = supabase
      .channel('chat_threads_changes_v2')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_threads' },
        (payload) => {
          queryClient.setQueryData<Thread[]>(queryKeys.conversaciones.threads, (prev) => {
            if (!prev) return prev
            if (payload.eventType === 'INSERT') {
              const newT = payload.new as Thread
              if (prev.find((t) => t.id === newT.id)) return prev
              return [newT, ...prev]
            }
            if (payload.eventType === 'UPDATE') {
              const updated = payload.new as Thread
              const filtered = prev.filter((t) => t.id !== updated.id)
              return [updated, ...filtered].sort(
                (a, b) =>
                  new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime(),
              )
            }
            return prev
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(messagesChannel)
      supabase.removeChannel(threadsChannel)
    }
  }, [supabase, activeThreadId, queryClient])

  // Reset unread cuando entras a un thread
  useEffect(() => {
    if (activeThreadId) setUnreadCount(0)
  }, [activeThreadId])

  // ─── Send message mutation. Optimistically appends to messages cache,
  //     rolls back on failure, restores draft.
  const sendMessageMutation = useSupabaseMutation<
    { thread: Thread; text: string; lineId: WhatsAppLineId },
    void
  >({
    mutationFn: async ({ thread, text, lineId }) => {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: thread.phone, text, threadId: thread.id, lineId }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => null)
        throw new Error(payload?.details || payload?.error || `HTTP ${res.status}`)
      }
    },
    invalidateKeys: [], // realtime will append the message via setQueryData
    errorMessage: 'No se pudo enviar el mensaje',
  })

  function sendMessage() {
    if (!draft.trim() || !activeThread || !selectedLineId || sendMessageMutation.isPending) return
    const text = draft
    setDraft('')

    // Optimistic: insert temp message in cache so the bubble appears instantly
    const optimistic: Message = {
      id: 'temp-' + Date.now(),
      thread_id: activeThread.id,
      direction: 'outbound',
      sender: 'human',
      content: text,
      metadata: {
        delivery_status: 'queued',
        sender_line_id: selectedLineId,
        sender_label: selectedLine?.label,
        sender_display_phone: selectedLine?.displayPhone,
        sender_provider: selectedLine?.provider,
      },
      created_at: new Date().toISOString(),
    }
    queryClient.setQueryData<Message[]>(
      queryKeys.conversaciones.messages(activeThread.id),
      (prev) => (prev ? [...prev, optimistic] : [optimistic]),
    )

    sendMessageMutation.mutate(
      { thread: activeThread, text, lineId: selectedLineId },
      {
        onError: () => {
          // Rollback the optimistic message + restore draft
          queryClient.setQueryData<Message[]>(
            queryKeys.conversaciones.messages(activeThread.id),
            (prev) => prev?.filter((m) => m.id !== optimistic.id) ?? prev,
          )
          setDraft(text)
        },
      },
    )
  }

  // ─── Toggle bot active mutation. Cache-level optimistic update.
  const toggleBotMutation = useSupabaseMutation<
    { thread: Thread; newState: boolean },
    void
  >({
    mutationFn: async ({ thread, newState }) => {
      const res = await fetch('/api/whatsapp/send', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: thread.id, bot_active: newState }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    },
    successMessage: ({}, input) => (input.newState ? 'Bot reanudado' : 'Bot pausado'),
    errorMessage: 'No se pudo cambiar el estado del bot',
  })

  function toggleBot() {
    if (!activeThread) return
    const newState = !activeThread.bot_active
    queryClient.setQueryData<Thread[]>(queryKeys.conversaciones.threads, (prev) =>
      prev?.map((t) => (t.id === activeThread.id ? { ...t, bot_active: newState } : t)) ?? prev,
    )
    toggleBotMutation.mutate(
      { thread: activeThread, newState },
      {
        onError: () => {
          // Rollback
          queryClient.setQueryData<Thread[]>(queryKeys.conversaciones.threads, (prev) =>
            prev?.map((t) =>
              t.id === activeThread.id ? { ...t, bot_active: !newState } : t,
            ) ?? prev,
          )
        },
      },
    )
  }

  // ─── Status change mutation
  const changeStatusMutation = useSupabaseMutation<
    { thread: Thread; newStatus: string; prevStatus: string },
    void
  >({
    mutationFn: async ({ thread, newStatus }) => {
      const res = await fetch('/api/whatsapp/send', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: thread.id, status: newStatus }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    },
    successMessage: ({}, input) =>
      `Marcado como ${STATUS_LABELS[input.newStatus] || input.newStatus}`,
    errorMessage: 'No se pudo actualizar el estado',
  })

  function changeStatus(newStatus: string) {
    if (!activeThread) return
    const prevStatus = activeThread.status
    queryClient.setQueryData<Thread[]>(queryKeys.conversaciones.threads, (prev) =>
      prev?.map((t) => (t.id === activeThread.id ? { ...t, status: newStatus } : t)) ?? prev,
    )
    changeStatusMutation.mutate(
      { thread: activeThread, newStatus, prevStatus },
      {
        onError: () => {
          queryClient.setQueryData<Thread[]>(queryKeys.conversaciones.threads, (prev) =>
            prev?.map((t) =>
              t.id === activeThread.id ? { ...t, status: prevStatus } : t,
            ) ?? prev,
          )
        },
      },
    )
  }

  // Sending state derived from mutation
  const sending = sendMessageMutation.isPending

  const filteredThreads = threads.filter((t) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      t.phone.includes(q) ||
      (t.contact_name || '').toLowerCase().includes(q) ||
      (t.last_message_preview || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="h-[calc(100vh-4rem)] -m-8 flex bg-black text-white">
      {/* COLUMNA IZQUIERDA: Lista de threads
          Mobile: full-width, hidden when a thread is active.
          Desktop: fixed 320px column, always visible. */}
      <aside
        className={`w-full md:w-80 border-r border-zinc-900 flex-col flex-shrink-0 ${
          activeThreadId ? 'hidden md:flex' : 'flex'
        }`}
      >
        <div className="p-4 border-b border-zinc-900">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Conversaciones</h2>
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-[10px] uppercase tracking-wider rounded-full px-1.5 py-0.5',
                  realtimeStatus === 'live'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : realtimeStatus === 'connecting'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    : 'bg-red-500/10 text-red-400 border border-red-500/30'
                )}
                title={
                  realtimeStatus === 'live'
                    ? 'Realtime conectado'
                    : realtimeStatus === 'connecting'
                    ? 'Conectando...'
                    : 'Realtime offline'
                }
              >
                {realtimeStatus === 'live' ? (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Live
                  </>
                ) : realtimeStatus === 'connecting' ? (
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
            <div className="flex items-center gap-1">
              <span className="text-xs text-zinc-500">{filteredThreads.length}</span>
              <button
                onClick={() => {
                  refetchThreads()
                  router.refresh()
                }}
                disabled={refreshing}
                title="Refrescar conversaciones"
                className="p-1 rounded hover:bg-zinc-900 text-zinc-500 hover:text-white transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
              </button>
            </div>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={() => setUnreadCount(0)}
              className="w-full mb-2 bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs rounded-lg px-3 py-1.5 flex items-center gap-2 hover:bg-cyan-500/20 transition-colors"
            >
              <Wifi className="h-3 w-3 animate-pulse" />
              {unreadCount} mensaje{unreadCount > 1 ? 's' : ''} nuevo{unreadCount > 1 ? 's' : ''} en otras conversaciones
            </button>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredThreads.length === 0 ? (
            <EmptyState
              icon={MessageCircle}
              title={threads.length === 0 ? 'Aún no hay conversaciones' : 'Sin resultados'}
              description={
                threads.length === 0
                  ? 'Lanza el Prospector o conecta WhatsApp y las conversaciones empezarán a aparecer aquí.'
                  : 'Prueba con otro nombre, teléfono o palabra clave.'
              }
            />
          ) : (
            filteredThreads.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveThreadId(t.id)}
                className={cn(
                  'w-full text-left p-3 border-b border-zinc-900/50 hover:bg-zinc-950 transition-colors flex flex-col gap-1',
                  activeThreadId === t.id && 'bg-zinc-900 hover:bg-zinc-900'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn('h-2 w-2 rounded-full flex-shrink-0', STATUS_COLORS[t.status] || 'bg-zinc-600')} />
                    <span className="font-medium text-sm truncate">
                      {t.contact_name || `+${t.phone}`}
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-600 flex-shrink-0">
                    {formatRelative(t.last_message_at)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {t.bot_active ? (
                    <Bot className="h-3 w-3 text-blue-400 flex-shrink-0" />
                  ) : (
                    <User className="h-3 w-3 text-orange-400 flex-shrink-0" />
                  )}
                  <p className="text-xs text-zinc-500 truncate">
                    {t.last_message_preview || '—'}
                  </p>
                </div>
                {senderLineLabel(t.metadata) && (
                  <div className="pl-5 text-[10px] text-emerald-400/80 truncate">
                    {senderLineLabel(t.metadata)}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </aside>

      {/* COLUMNA CENTRAL: Chat
          Mobile: only visible when a thread is selected (with back button)
          Desktop: always rendered */}
      <main
        className={`flex-1 flex-col min-w-0 ${
          activeThreadId ? 'flex' : 'hidden md:flex'
        }`}
      >
        {!activeThread ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={MessageCircle}
              title="Selecciona una conversación"
              description="Elige un chat de la lista para ver el historial y responder."
            />
          </div>
        ) : (
          <>
            {/* Header */}
            <header className="h-16 border-b border-zinc-900 flex items-center justify-between px-3 md:px-6 gap-2">
              <div className="flex items-center gap-2 md:gap-3 min-w-0">
                {/* Back button — mobile only */}
                <button
                  type="button"
                  onClick={() => setActiveThreadId(null)}
                  className="md:hidden h-9 w-9 inline-flex items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-900 hover:text-white shrink-0"
                  aria-label="Volver a la lista"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="h-9 w-9 rounded-full bg-zinc-900 flex items-center justify-center shrink-0">
                  <Phone className="h-4 w-4 text-zinc-400" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {activeThread.contact_name || `+${activeThread.phone}`}
                  </div>
                  <div className="text-xs text-zinc-500 truncate">
                    +{activeThread.phone} ·{' '}
                    {activeThread.bot_active ? (
                      <span className="text-blue-400">Bot activo</span>
                    ) : (
                      <span className="text-orange-400">Tú estás respondiendo</span>
                    )}
                    {senderLineLabel(activeThread.metadata)
                      ? ` · vía ${senderLineLabel(activeThread.metadata)}`
                      : ''}
                  </div>
                </div>
              </div>
              <button
                onClick={toggleBot}
                className={cn(
                  'flex items-center gap-2 text-xs font-medium rounded-lg px-3 py-1.5 transition-colors',
                  activeThread.bot_active
                    ? 'bg-orange-500/10 text-orange-400 hover:bg-orange-500/20'
                    : 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'
                )}
              >
                {activeThread.bot_active ? (
                  <>
                    <Pause className="h-3.5 w-3.5" />
                    Pausar bot
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" />
                    Reanudar bot
                  </>
                )}
              </button>
            </header>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {loadingMessages ? (
                <div className="flex items-center justify-center py-8 text-zinc-600 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Cargando...
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center text-zinc-600 text-sm py-8">
                  Sin mensajes aún
                </div>
              ) : (
                messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer */}
            <div className="border-t border-zinc-900 p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <label htmlFor="whatsapp-line" className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  Enviar desde
                </label>
                <select
                  id="whatsapp-line"
                  value={selectedLineId || ''}
                  onChange={(event) => setSelectedLineId(event.target.value as WhatsAppLineId)}
                  disabled={loadingLines || sending}
                  className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-emerald-500 disabled:opacity-50"
                >
                  {!selectedLineId && <option value="">Sin línea disponible</option>}
                  {lineConfig?.lines.map((line) => (
                    <option key={line.id} value={line.id} disabled={!line.enabled}>
                      {line.label} · {line.displayPhone ? formatWhatsAppNumber(line.displayPhone) : 'línea principal'}{line.enabled ? '' : ' (no configurada)'}
                    </option>
                  ))}
                </select>
                {selectedLine && (
                  <span className="text-[10px] text-emerald-400">
                    {selectedLine.provider === 'meta_cloud' ? 'Meta Cloud API oficial' : 'Evolution API'}
                  </span>
                )}
              </div>
              <div className="flex items-end gap-2 bg-zinc-950 border border-zinc-800 rounded-xl p-2 focus-within:border-zinc-700 transition-colors">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage()
                    }
                  }}
                  placeholder={
                    activeThread.bot_active
                      ? 'Escribir mensaje (esto pausará el bot)...'
                      : 'Escribir mensaje...'
                  }
                  rows={1}
                  className="flex-1 bg-transparent resize-none text-sm focus:outline-none placeholder-zinc-600 px-2 py-1.5 max-h-32"
                />
                <button
                  onClick={sendMessage}
                  disabled={!draft.trim() || !selectedLineId || sending}
                  title={selectedLine ? `Enviar desde ${selectedLine.label}` : 'No hay una línea configurada'}
                  className="bg-white text-black rounded-lg p-2 hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </>
        )}
      </main>

      {/* COLUMNA DERECHA: Detalles
          Hidden on mobile (saves space — chat is the priority).
          Visible on lg+ when there's an active thread. */}
      {activeThread && (
        <aside className="hidden lg:flex w-72 border-l border-zinc-900 flex-col overflow-y-auto">
          <div className="p-5 border-b border-zinc-900">
            <div className="text-xs text-zinc-500 mb-1">Contacto</div>
            <div className="font-semibold text-sm mb-3">
              {activeThread.contact_name || 'Sin nombre'}
            </div>
            <div className="text-xs text-zinc-400 font-mono">+{activeThread.phone}</div>
          </div>

          <div className="p-5 border-b border-zinc-900">
            <div className="text-xs text-zinc-500 mb-2">Línea de WhatsApp</div>
            <div className="text-xs text-white">
              {senderLineLabel(activeThread.metadata) || 'Todavía sin identificar'}
            </div>
          </div>

          <div className="p-5 border-b border-zinc-900">
            <div className="text-xs text-zinc-500 mb-3">Estado</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => changeStatus(key)}
                  className={cn(
                    'text-xs rounded-lg px-3 py-2 transition-colors flex items-center gap-1.5',
                    activeThread.status === key
                      ? 'bg-white text-black font-medium'
                      : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_COLORS[key])} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-5 border-b border-zinc-900">
            <div className="text-xs text-zinc-500 mb-3">Bot</div>
            <div className="text-xs text-zinc-400 mb-2">
              Tipo: <span className="text-white capitalize">{activeThread.bot_type}</span>
            </div>
            <div className="text-xs text-zinc-400">
              Estado:{' '}
              {activeThread.bot_active ? (
                <span className="text-blue-400">Respondiendo automático</span>
              ) : (
                <span className="text-orange-400">Pausado (modo manual)</span>
              )}
            </div>
          </div>

          <div className="p-5 flex flex-col gap-2">
            <button
              onClick={() => changeStatus('qualified')}
              className="w-full text-xs bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 rounded-lg py-2.5 px-3 flex items-center justify-center gap-2 transition-colors font-medium"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Marcar como Calificado
            </button>
            <button
              onClick={() => changeStatus('closed')}
              className="w-full text-xs bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded-lg py-2.5 px-3 flex items-center justify-center gap-2 transition-colors font-medium"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Marcar como Cerrado
            </button>
          </div>
        </aside>
      )}
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isOutbound = message.direction === 'outbound'
  const isHuman = message.sender === 'human'
  const isBot = message.sender === 'bot'
  const deliveryLabel: Record<string, string> = {
    queued: 'Preparando',
    accepted: 'Aceptado por Meta',
    sent: 'Enviado',
    delivered: 'Entregado',
    read: 'Leído',
    failed: 'Falló',
  }
  const deliveryStatus = message.metadata?.delivery_status
  const lineLabel = senderLineLabel(message.metadata)

  return (
    <div className={cn('flex', isOutbound ? 'justify-end' : 'justify-start')}>
      <div className="max-w-[75%]">
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words',
            isOutbound
              ? isHuman
                ? 'bg-orange-500 text-white rounded-br-sm'
                : 'bg-blue-500 text-white rounded-br-sm'
              : 'bg-zinc-900 text-zinc-100 rounded-bl-sm'
          )}
        >
          {message.content}
        </div>
        <div
          className={cn(
            'text-[10px] text-zinc-600 mt-1 flex items-center gap-1',
            isOutbound ? 'justify-end' : 'justify-start'
          )}
        >
          {isBot && <Bot className="h-3 w-3" />}
          {isHuman && <User className="h-3 w-3" />}
          <span>
            {isBot ? 'Bot' : isHuman ? 'Tú' : 'Cliente'} ·{' '}
            {new Date(message.created_at).toLocaleTimeString('es-CO', {
              hour: '2-digit',
              minute: '2-digit',
            })}
            {isOutbound && deliveryStatus
              ? ` · ${deliveryLabel[deliveryStatus] || deliveryStatus}`
              : ''}
            {lineLabel ? ` · ${lineLabel}` : ''}
          </span>
        </div>
      </div>
    </div>
  )
}

function formatRelative(iso: string): string {
  const date = new Date(iso)
  const diffMs = Date.now() - date.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d`
  return date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}
