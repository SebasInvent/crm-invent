'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, X, Sparkles, Loader2, MessageSquare, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

/**
 * Aria — floating chat widget embedded in the CRM.
 *
 * Aria lives in n8n with the Obsidian brain tools (consultar_cerebro,
 * escribir_en_cerebro, leer_nota_cerebro). This widget posts to
 * /api/aria/chat which proxies to the n8n webhook, so Sebastian can ask
 * Aria anything from any page in the CRM without leaving context.
 *
 * Design notes:
 *   - Bottom-right floating button (consistent with Intercom/Crisp)
 *   - Click → slide-up panel (md+) or full-screen sheet (mobile)
 *   - Conversation persisted in localStorage so it survives reloads
 *   - Cmd+J shortcut to toggle (Cmd+K is taken by command palette)
 */

type AriaMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}

const STORAGE_KEY = 'aria-conversation-v1'
const MAX_HISTORY = 20

function loadHistory(): AriaMessage[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(-MAX_HISTORY) : []
  } catch {
    return []
  }
}

function saveHistory(messages: AriaMessage[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_HISTORY)))
  } catch {
    // localStorage might be full or disabled — silently degrade
  }
}

export function AriaWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<AriaMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Hydrate conversation from localStorage on mount
  useEffect(() => {
    setMessages(loadHistory())
  }, [])

  // Persist on every change
  useEffect(() => {
    saveHistory(messages)
  }, [messages])

  // Cmd+J / Ctrl+J toggles the widget
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'j' || e.key === 'J') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Autofocus input when opening
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [open])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  const send = useCallback(async () => {
    const text = draft.trim()
    if (!text || sending) return

    const userMsg: AriaMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: Date.now(),
    }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setDraft('')
    setSending(true)

    try {
      const res = await fetch('/api/aria/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          // Send last N messages so Aria has context (server may truncate further)
          history: nextMessages.slice(-MAX_HISTORY).map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      })

      if (!res.ok) {
        const errorText = await res.text().catch(() => '')
        throw new Error(errorText || `HTTP ${res.status}`)
      }

      const data = (await res.json()) as { reply?: string; error?: string }
      if (data.error) throw new Error(data.error)

      const assistantMsg: AriaMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: data.reply || '(sin respuesta)',
        createdAt: Date.now(),
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (err) {
      console.error('Aria error:', err)
      toast.error('Aria no respondió', {
        description: err instanceof Error ? err.message : 'Verifica que el webhook esté activo.',
      })
      // Re-append the draft so the user doesn't lose what they typed
      setDraft(text)
      // Roll back the optimistic user message so we don't end up with
      // orphan user-turns in the transcript
      setMessages(messages)
    } finally {
      setSending(false)
    }
  }, [draft, messages, sending])

  function clearConversation() {
    setMessages([])
    saveHistory([])
    toast.success('Conversación borrada')
  }

  return (
    <>
      {/* Floating button — only when widget closed.
          Hidden on /dashboard/conversaciones because that page already
          uses the bottom-right area for the chat composer. */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir Aria"
          className="fixed bottom-4 right-4 z-40 inline-flex items-center justify-center h-12 w-12 rounded-full bg-white text-black shadow-2xl hover:scale-105 transition-transform"
        >
          <Sparkles className="h-5 w-5" />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          className={cn(
            'fixed z-[60] flex flex-col bg-zinc-950 border border-zinc-800 shadow-2xl',
            // Mobile: full-screen sheet
            'inset-0 md:inset-auto',
            // Desktop: bottom-right floating panel
            'md:bottom-4 md:right-4 md:w-[400px] md:h-[600px] md:rounded-2xl md:max-h-[calc(100vh-2rem)]',
            'animate-in fade-in slide-in-from-bottom-4 duration-200',
          )}
        >
          {/* Header */}
          <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-cyan-400 to-fuchsia-500 flex items-center justify-center flex-shrink-0">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">Aria</div>
                <div className="text-[11px] text-zinc-500">
                  Conectada al cerebro de Invent
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={clearConversation}
                  aria-label="Borrar conversación"
                  className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar Aria"
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-900 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4">
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-cyan-400/20 to-fuchsia-500/20 border border-zinc-800 flex items-center justify-center mb-4">
                  <Sparkles className="h-6 w-6 text-zinc-300" strokeWidth={1.5} />
                </div>
                <h3 className="text-base font-semibold text-white mb-1">Habla con Aria</h3>
                <p className="text-sm text-zinc-500 max-w-xs leading-relaxed mb-5">
                  Pregúntale al cerebro de Invent. Sabe sobre tus contactos, leads,
                  notas de Obsidian y procesos.
                </p>
                <div className="grid grid-cols-1 gap-2 w-full max-w-xs">
                  {[
                    '¿Qué leads necesitan follow-up esta semana?',
                    'Resumen de mis notas sobre branding',
                    'Métricas del pipeline este mes',
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => {
                        setDraft(suggestion)
                        inputRef.current?.focus()
                      }}
                      className="text-left text-xs px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words leading-relaxed',
                      msg.role === 'user'
                        ? 'bg-white text-black rounded-br-sm'
                        : 'bg-zinc-900 text-zinc-100 border border-zinc-800 rounded-bl-sm',
                    )}
                  >
                    {msg.content}
                  </div>
                </div>
              ))
            )}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl rounded-bl-sm px-3.5 py-2 flex items-center gap-2 text-sm text-zinc-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Pensando…
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Composer */}
          <div className="border-t border-zinc-800 p-3 flex-shrink-0">
            <div className="flex items-end gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-2 focus-within:border-zinc-700 transition-colors">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send()
                  }
                }}
                placeholder="Pregúntale algo a Aria…"
                rows={1}
                disabled={sending}
                className="flex-1 bg-transparent resize-none text-sm focus:outline-none text-white placeholder-zinc-500 px-2 py-1 max-h-32 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={!draft.trim() || sending}
                aria-label="Enviar"
                className="bg-white text-black rounded-lg p-2 hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            <div className="flex items-center justify-between mt-2 px-1 text-[10px] text-zinc-600">
              <span>
                <kbd className="font-mono bg-zinc-900 border border-zinc-800 rounded px-1 py-0.5">⌘ J</kbd>{' '}
                para abrir/cerrar
              </span>
              <span>{messages.length}/{MAX_HISTORY} mensajes</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
