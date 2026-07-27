import Link from 'next/link'
import { getServiceRoleClient } from '@/lib/supabase'
import { getActiveOrg } from '@/lib/api-auth'
import { redirect } from 'next/navigation'
import {
  Flame,
  MessageCircle,
  TrendingUp,
  Target,
  ArrowUpRight,
  Bot,
  CircleDot,
  Sparkles,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

/**
 * Returns the ISO timestamp for the start of "today" in Bogotá time (UTC-5).
 *
 * Naive `new Date(year, month, day)` interprets the components as the
 * server's local timezone. On Vercel that is UTC, so for any user in UTC-5
 * the result is *yesterday* between 19:00 and 23:59 local. This bug made
 * "Hot leads today" show yesterday's count every evening.
 */
function startOfDayBogotaIso(): string {
  // Bogotá is UTC-5 year-round (no DST).
  const offsetMs = 5 * 60 * 60 * 1000
  const nowUtcMs = Date.now()
  const bogotaMs = nowUtcMs - offsetMs
  const bogotaDate = new Date(bogotaMs)
  // Build a UTC midnight that, when shifted +5h, lands at Bogotá midnight today.
  const utcStart = Date.UTC(
    bogotaDate.getUTCFullYear(),
    bogotaDate.getUTCMonth(),
    bogotaDate.getUTCDate(),
  ) + offsetMs
  return new Date(utcStart).toISOString()
}

async function getSalesStats(orgId: string) {
  const supabase = getServiceRoleClient()
  const now = new Date()
  const startOfDay = startOfDayBogotaIso()
  const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Run queries in parallel
  const [
    hotLeadsTotal,
    hotLeadsToday,
    leadsThisWeek,
    activeConversations,
    threadsBotPaused,
    qualifiedThreads,
    recentHotLeads,
    recentMessages,
  ] = await Promise.all([
    supabase.from('leads' as never).select('id', { count: 'exact', head: true }).eq('org_id' as never, orgId).eq('lead_status' as never, 'hot'),
    supabase
      .from('leads' as never)
      .select('id', { count: 'exact', head: true })
      .eq('org_id' as never, orgId)
      .eq('lead_status' as never, 'hot')
      .gte('created_at' as never, startOfDay),
    supabase
      .from('leads' as never)
      .select('id', { count: 'exact', head: true })
      .eq('org_id' as never, orgId)
      .gte('created_at' as never, startOfWeek),
    supabase.from('chat_threads' as never).select('id', { count: 'exact', head: true }).eq('org_id' as never, orgId).eq('status' as never, 'active'),
    supabase.from('chat_threads' as never).select('id', { count: 'exact', head: true }).eq('org_id' as never, orgId).eq('bot_active' as never, false),
    supabase.from('chat_threads' as never).select('id', { count: 'exact', head: true }).eq('org_id' as never, orgId).eq('status' as never, 'qualified'),
    supabase
      .from('leads' as never)
      .select('*')
      .eq('org_id' as never, orgId)
      .eq('lead_status' as never, 'hot')
      .order('created_at' as never, { ascending: false })
      .limit(5),
    supabase
      .from('chat_threads' as never)
      .select('*')
      .eq('org_id' as never, orgId)
      .order('last_message_at' as never, { ascending: false })
      .limit(5),
  ])

  return {
    hotLeadsTotal: hotLeadsTotal.count || 0,
    hotLeadsToday: hotLeadsToday.count || 0,
    leadsThisWeek: leadsThisWeek.count || 0,
    activeConversations: activeConversations.count || 0,
    threadsBotPaused: threadsBotPaused.count || 0,
    qualifiedThreads: qualifiedThreads.count || 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recentHotLeads: (recentHotLeads.data as any[]) || [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recentMessages: (recentMessages.data as any[]) || [],
  }
}

export default async function DashboardPage() {
  const org = await getActiveOrg()
  if (org.error) redirect('/login')
  const s = await getSalesStats(org.orgId)

  return (
    <div className="space-y-8 max-w-[1400px]">

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Sales Machine</h1>
          <p className="text-zinc-500 mt-1 text-sm">
            Sistema de ventas autónomo de Invent Agency
          </p>
        </div>
        <Link
          href="/dashboard/conversaciones"
          className="bg-white text-black text-sm font-semibold rounded-lg px-4 py-2.5 hover:bg-zinc-100 transition-colors flex items-center gap-2"
        >
          <MessageCircle className="h-4 w-4" />
          Ver Conversaciones
        </Link>
      </div>

      {/* Hero KPI: Leads HOT */}
      <div className="grid gap-4 lg:grid-cols-4">
        <KpiCard
          label="Leads HOT hoy"
          value={s.hotLeadsToday}
          icon={<Flame className="h-5 w-5 text-orange-400" />}
          accent="orange"
          subtitle={`${s.hotLeadsTotal} en total`}
          highlight
        />
        <KpiCard
          label="Conversaciones activas"
          value={s.activeConversations}
          icon={<MessageCircle className="h-5 w-5 text-blue-400" />}
          accent="blue"
          subtitle={s.threadsBotPaused > 0 ? `${s.threadsBotPaused} en modo manual` : 'todo automático'}
        />
        <KpiCard
          label="Calificados"
          value={s.qualifiedThreads}
          icon={<Sparkles className="h-5 w-5 text-emerald-400" />}
          accent="emerald"
          subtitle="listos para cerrar"
        />
        <KpiCard
          label="Leads esta semana"
          value={s.leadsThisWeek}
          icon={<TrendingUp className="h-5 w-5 text-purple-400" />}
          accent="purple"
          subtitle="contactados por bots"
        />
      </div>

      {/* Two columns: Hot leads & Recent activity */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Hot Leads */}
        <div className="bg-zinc-950 border border-zinc-900 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-zinc-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-400" />
              <h2 className="font-semibold text-sm text-white">Leads Hot — para llamar ya</h2>
            </div>
            <Link
              href="/dashboard/leads"
              className="text-xs text-zinc-500 hover:text-white flex items-center gap-1"
            >
              Ver todos <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>

          {s.recentHotLeads.length === 0 ? (
            <EmptyState
              icon={<Target className="h-8 w-8 text-zinc-700" />}
              title="Aún no hay leads hot"
              cta="Los bots están trabajando — los primeros aparecerán pronto"
            />
          ) : (
            <div className="divide-y divide-zinc-900/50">
              {s.recentHotLeads.map((lead) => (
                <div key={lead.id} className="p-4 hover:bg-zinc-900/30 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm text-white truncate">
                        {lead.name || 'Sin nombre'}
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5 font-mono">
                        +{lead.phone}
                      </div>
                      {lead.notes && (
                        <p className="text-xs text-zinc-400 mt-2 line-clamp-2">{lead.notes}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <span className="bg-orange-500/10 text-orange-400 text-[10px] font-bold rounded-md px-2 py-0.5">
                        {lead.lead_score || '?'}
                      </span>
                      <span className="text-[10px] text-zinc-600">
                        {timeAgo(lead.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Conversations */}
        <div className="bg-zinc-950 border border-zinc-900 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-zinc-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-blue-400" />
              <h2 className="font-semibold text-sm text-white">Conversaciones recientes</h2>
            </div>
            <Link
              href="/dashboard/conversaciones"
              className="text-xs text-zinc-500 hover:text-white flex items-center gap-1"
            >
              Ver todas <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>

          {s.recentMessages.length === 0 ? (
            <EmptyState
              icon={<MessageCircle className="h-8 w-8 text-zinc-700" />}
              title="Sin conversaciones aún"
              cta="Cuando los prospectos respondan al bot, aparecerán aquí en vivo"
            />
          ) : (
            <div className="divide-y divide-zinc-900/50">
              {s.recentMessages.map((thread) => (
                <Link
                  key={thread.id}
                  href="/dashboard/conversaciones"
                  className="block p-4 hover:bg-zinc-900/30 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <CircleDot
                      className={`h-3 w-3 mt-1 flex-shrink-0 ${
                        thread.status === 'qualified'
                          ? 'text-orange-400'
                          : thread.status === 'closed'
                          ? 'text-emerald-400'
                          : thread.status === 'cold'
                          ? 'text-zinc-600'
                          : 'text-blue-400'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-sm text-white truncate">
                          {thread.contact_name || `+${thread.phone}`}
                        </div>
                        <span className="text-[10px] text-zinc-600 ml-2 flex-shrink-0">
                          {timeAgo(thread.last_message_at)}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 truncate mt-0.5">
                        {thread.last_message_preview || 'Sin mensajes aún'}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        {thread.bot_active ? (
                          <span className="text-[10px] text-blue-400 flex items-center gap-1">
                            <Bot className="h-3 w-3" /> bot
                          </span>
                        ) : (
                          <span className="text-[10px] text-orange-400 flex items-center gap-1">
                            <CircleDot className="h-3 w-3" /> manual
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="bg-gradient-to-br from-zinc-950 to-zinc-900/50 border border-zinc-900 rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Acciones rápidas</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickAction
            href="/dashboard/conversaciones"
            label="Conversaciones"
            sub="Ver chats en vivo"
            icon={<MessageCircle className="h-5 w-5" />}
          />
          <QuickAction
            href="/dashboard/leads"
            label="Leads"
            sub="Pipeline completo"
            icon={<Target className="h-5 w-5" />}
          />
          <QuickAction
            href="/dashboard/contacts"
            label="Contactos"
            sub="Base de datos"
            icon={<Sparkles className="h-5 w-5" />}
          />
          <QuickAction
            href="/dashboard/analytics"
            label="Analytics"
            sub="Métricas y reportes"
            icon={<TrendingUp className="h-5 w-5" />}
          />
        </div>
      </div>
    </div>
  )
}

function KpiCard({
  label,
  value,
  icon,
  accent,
  subtitle,
  highlight,
}: {
  label: string
  value: number
  icon: React.ReactNode
  accent: 'orange' | 'blue' | 'emerald' | 'purple'
  subtitle?: string
  highlight?: boolean
}) {
  const accents: Record<string, string> = {
    orange: 'from-orange-500/10 to-transparent border-orange-500/20',
    blue: 'from-blue-500/10 to-transparent border-blue-500/20',
    emerald: 'from-emerald-500/10 to-transparent border-emerald-500/20',
    purple: 'from-purple-500/10 to-transparent border-purple-500/20',
  }
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${
        highlight
          ? `bg-gradient-to-br ${accents[accent]} bg-zinc-950`
          : 'bg-zinc-950 border-zinc-900'
      } p-5`}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs text-zinc-500 font-medium">{label}</span>
        {icon}
      </div>
      <div className="text-3xl font-bold text-white tracking-tight">{value}</div>
      {subtitle && <div className="text-xs text-zinc-500 mt-1">{subtitle}</div>}
    </div>
  )
}

function EmptyState({ icon, title, cta }: { icon: React.ReactNode; title: string; cta: string }) {
  return (
    <div className="p-10 text-center">
      <div className="flex justify-center mb-3">{icon}</div>
      <p className="text-sm text-white font-medium">{title}</p>
      <p className="text-xs text-zinc-500 mt-1">{cta}</p>
    </div>
  )
}

function QuickAction({
  href,
  label,
  sub,
  icon,
}: {
  href: string
  label: string
  sub: string
  icon: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="bg-zinc-950 border border-zinc-900 rounded-xl p-4 hover:bg-zinc-900 hover:border-zinc-800 transition-colors group"
    >
      <div className="text-zinc-400 group-hover:text-white transition-colors mb-2">
        {icon}
      </div>
      <div className="text-sm font-semibold text-white">{label}</div>
      <div className="text-xs text-zinc-500">{sub}</div>
    </Link>
  )
}

function timeAgo(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'ahora'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}
