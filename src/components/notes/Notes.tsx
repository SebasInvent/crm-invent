'use client'

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { StickyNote, Loader2, Send, Trash2, Pencil, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'

type Note = {
  id: string
  body: string
  author_email: string | null
  author_id: string | null
  created_at: string
  updated_at: string
  lead_id: string | null
  contact_id: string | null
  deal_id: string | null
}

interface Props {
  leadId?: string
  contactId?: string
  dealId?: string
}

/**
 * Notes — collaborative thread of plain-text notes attached to a
 * single lead, contact, or deal. The author is captured server-side
 * so users can't impersonate. Only the author can edit/delete their
 * own note.
 */
export function Notes({ leadId, contactId, dealId }: Props) {
  const qc = useQueryClient()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

  const params = new URLSearchParams()
  if (leadId) params.set('lead_id', leadId)
  if (contactId) params.set('contact_id', contactId)
  if (dealId) params.set('deal_id', dealId)
  const queryKey = ['notes', leadId ?? null, contactId ?? null, dealId ?? null]

  const { data, isLoading } = useQuery<{ notes: Note[] }>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/notes?${params.toString()}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    enabled: !!(leadId || contactId || dealId),
    staleTime: 30_000,
  })

  const createMutation = useMutation({
    mutationFn: async (body: string) => {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body,
          lead_id: leadId,
          contact_id: contactId,
          deal_id: dealId,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      return json.note as Note
    },
    onSuccess: () => {
      setDraft('')
      qc.invalidateQueries({ queryKey })
      // Also invalidate timeline since notes appear there too
      qc.invalidateQueries({ queryKey: ['timeline'] })
    },
    onError: (err: Error) => {
      toast.error('No se pudo crear la nota', { description: err.message })
    },
  })

  const patchMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const res = await fetch(`/api/notes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      return json.note as Note
    },
    onSuccess: () => {
      setEditingId(null)
      setEditDraft('')
      qc.invalidateQueries({ queryKey })
      qc.invalidateQueries({ queryKey: ['timeline'] })
    },
    onError: (err: Error) => {
      toast.error('No se pudo guardar la nota', { description: err.message })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/notes/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error || `HTTP ${res.status}`)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey })
      qc.invalidateQueries({ queryKey: ['timeline'] })
      toast.success('Nota eliminada')
    },
    onError: (err: Error) => {
      toast.error('No se pudo eliminar', { description: err.message })
    },
  })

  function submit() {
    const body = draft.trim()
    if (!body || createMutation.isPending) return
    createMutation.mutate(body)
  }

  function startEdit(note: Note) {
    setEditingId(note.id)
    setEditDraft(note.body)
  }

  function saveEdit() {
    const body = editDraft.trim()
    if (!body || !editingId || patchMutation.isPending) return
    patchMutation.mutate({ id: editingId, body })
  }

  const notes = data?.notes ?? []

  return (
    <div className="space-y-4">
      {/* Composer */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 focus-within:border-zinc-700 transition-colors">
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="Escribe una nota… (⌘ Enter para guardar)"
          rows={2}
          className="w-full bg-transparent resize-none text-sm focus:outline-none text-white placeholder-zinc-500 leading-relaxed"
          disabled={createMutation.isPending}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-zinc-600">
            {draft.length}/5000
          </span>
          <Button
            size="sm"
            onClick={submit}
            disabled={!draft.trim() || createMutation.isPending}
            className="bg-white text-black hover:bg-zinc-200 h-8"
          >
            {createMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <Send className="h-3.5 w-3.5 mr-1" />
            )}
            Guardar
          </Button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center gap-2 justify-center py-8 text-zinc-500 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando notas…
        </div>
      ) : notes.length === 0 ? (
        <EmptyState
          icon={StickyNote}
          title="Sin notas"
          description="Apunta lo que importa: contexto del cliente, próximos pasos, decisiones tomadas. Las notas aparecen también en la línea de tiempo."
        />
      ) : (
        <ol className="space-y-3">
          {notes.map((note) => {
            const isEditing = editingId === note.id
            const wasEdited = note.updated_at && note.updated_at !== note.created_at
            return (
              <li
                key={note.id}
                className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 hover:bg-zinc-900/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <StickyNote className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                    <span className="text-xs text-zinc-400 truncate">
                      {note.author_email ?? 'autor desconocido'}
                    </span>
                    <span className="text-xs text-zinc-600 flex-shrink-0">
                      {formatDistanceToNow(new Date(note.created_at), {
                        addSuffix: true,
                        locale: es,
                      })}
                      {wasEdited && ' (editada)'}
                    </span>
                  </div>
                  {!isEditing && (
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button
                        type="button"
                        aria-label="Editar nota"
                        onClick={() => startEdit(note)}
                        className="h-7 w-7 inline-flex items-center justify-center rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Eliminar nota"
                        onClick={() => {
                          if (!window.confirm('¿Eliminar esta nota? No se puede deshacer.')) return
                          deleteMutation.mutate(note.id)
                        }}
                        className="h-7 w-7 inline-flex items-center justify-center rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-900"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <div>
                    <textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={3}
                      className={cn(
                        'w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2',
                        'text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700',
                        'resize-none leading-relaxed',
                      )}
                      autoFocus
                    />
                    <div className="flex items-center justify-end gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 border-zinc-700 text-zinc-400"
                        onClick={() => {
                          setEditingId(null)
                          setEditDraft('')
                        }}
                      >
                        <X className="h-3 w-3 mr-1" />
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        onClick={saveEdit}
                        disabled={!editDraft.trim() || patchMutation.isPending}
                        className="bg-white text-black hover:bg-zinc-200 h-7"
                      >
                        {patchMutation.isPending ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3 mr-1" />
                        )}
                        Guardar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-200 whitespace-pre-wrap break-words leading-relaxed">
                    {note.body}
                  </p>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
