'use client'

import { useQuery } from '@tanstack/react-query'
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  MessageCircle,
  Mail,
  TrendingUp,
  FileText,
  StickyNote,
  Phone,
  Calendar,
  CheckCircle,
  Activity,
  Loader2,
  Bot,
  User,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'

type TimelineEvent = {
  id: string
  type: string
  source: 'activity' | 'chat' | 'email' | 'deal'
  timestamp: string
  title: string
  description?: string | null
  metadata?: Record<string, unknown>
}

interface Props {
  contactId?: string
  leadId?: string
  /** Optional cap; defaults to 80 */
  limit?: number
}

/**
 * Activity timeline — a chronological feed of every interaction that
 * touched a contact or lead. Pulls from /api/timeline which merges
 * activity_logs, chat_messages, email_logs, and deals.
 *
 * Rendered as a vertical thread with day-grouped headers and a
 * source-colored dot per event. Source dictates which icon and which
 * accent color is used so users can scan quickly:
 *
 *   activity → zinc/sky
 *   chat     → emerald
 *   email    → orange
 *   deal     → fuchsia
 *
 * Events are clickable when the metadata gives us something to link to.
 */
export function Timeline({ contactId, leadId, limit = 80 }: Props) {
  const params = new URLSearchParams()
  if (contactId) params.set('contact_id', contactId)
  if (leadId) params.set('lead_id', leadId)
  params.set('limit', String(limit))

  const { data, isLoading, error } = useQuery<{
    ok: boolean
    count: number
    events: TimelineEvent[]
  }>({
    queryKey: ['timeline', contactId ?? null, leadId ?? null, limit],
    queryFn: async () => {
      const res = await fetch(`/api/timeline?${params.toString()}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    enabled: !!(contactId || leadId),
    staleTime: 60_000, // 1 min — timeline isn't urgent
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-zinc-500 text-sm gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando actividad…
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
        No se pudo cargar la actividad: {(error as Error).message}
      </div>
    )
  }

  const events = data?.events ?? []
  if (events.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="Sin actividad todavía"
        description="Cuando llegue un mensaje, se envíe un email o se mueva un deal, aparecerá aquí en orden cronológico."
      />
    )
  }

  // Group by day for nicer headers
  const groups: { label: string; items: TimelineEvent[] }[] = []
  for (const ev of events) {
    const label = formatDayLabel(ev.timestamp)
    const last = groups[groups.length - 1]
    if (last && last.label === label) {
      last.items.push(ev)
    } else {
      groups.push({ label, items: [ev] })
    }
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-3 px-1">
            {group.label}
          </div>
          <ol className="relative border-l border-zinc-800 ml-3 space-y-4">
            {group.items.map((ev) => (
              <EventRow key={ev.id} event={ev} />
            ))}
          </ol>
        </div>
      ))}
    </div>
  )
}

function EventRow({ event }: { event: TimelineEvent }) {
  const { Icon, color } = iconFor(event)
  return (
    <li className="ml-4 relative">
      <span
        className={cn(
          'absolute -left-[25px] top-1 flex items-center justify-center h-5 w-5 rounded-full border bg-zinc-950',
          color.border,
        )}
      >
        <Icon className={cn('h-3 w-3', color.text)} />
      </span>
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 hover:bg-zinc-900/60 transition-colors">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn('text-sm font-medium text-white truncate')}>{event.title}</span>
            <span className="text-[10px] uppercase tracking-wider text-zinc-600">
              {event.source}
            </span>
          </div>
          <span className="text-xs text-zinc-500 flex-shrink-0" title={event.timestamp}>
            {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true, locale: es })}
          </span>
        </div>
        {event.description && (
          <p className="text-sm text-zinc-400 mt-1 whitespace-pre-wrap break-words leading-relaxed">
            {truncate(event.description, 280)}
          </p>
        )}
      </div>
    </li>
  )
}

function iconFor(event: TimelineEvent): {
  Icon: LucideIcon
  color: { border: string; text: string }
} {
  // First map by source for the color
  const sourceColors = {
    activity: { border: 'border-sky-500/40', text: 'text-sky-400' },
    chat: { border: 'border-emerald-500/40', text: 'text-emerald-400' },
    email: { border: 'border-orange-500/40', text: 'text-orange-400' },
    deal: { border: 'border-fuchsia-500/40', text: 'text-fuchsia-400' },
  } as const

  // Then map by type for the icon
  const iconMap: Record<string, LucideIcon> = {
    note: StickyNote,
    email: Mail,
    email_sent: Mail,
    call: Phone,
    meeting: Calendar,
    task_completed: CheckCircle,
    stage_change: TrendingUp,
    deal_created: TrendingUp,
    deal_updated: TrendingUp,
    deal_won: CheckCircle,
    deal_lost: TrendingUp,
    web_visit: Activity,
    document_viewed: FileText,
    proposal_sent: FileText,
    conversation: MessageCircle,
    telegram_message: MessageCircle,
    whatsapp_message: MessageCircle,
  }

  const inferredFromMeta =
    event.source === 'chat' && event.metadata && (event.metadata as any).sender === 'bot'
      ? Bot
      : event.source === 'chat' && event.metadata && (event.metadata as any).sender === 'human'
        ? User
        : null

  return {
    Icon: inferredFromMeta || iconMap[event.type] || Activity,
    color: sourceColors[event.source] || sourceColors.activity,
  }
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso)
  if (isToday(d)) return 'Hoy'
  if (isYesterday(d)) return 'Ayer'
  return format(d, "EEEE d 'de' MMMM yyyy", { locale: es })
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + '…'
}
