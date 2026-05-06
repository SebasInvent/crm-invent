import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getServiceRoleClient } from '@/lib/supabase'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Calendar,
  Flame,
  Thermometer,
  Snowflake,
  Skull,
  CheckCircle,
  ChevronRight,
  Clock,
} from 'lucide-react'
import { format, isToday, isTomorrow, isPast } from 'date-fns'
import { es } from 'date-fns/locale'

export const dynamic = 'force-dynamic'

const STATUS_CONFIG: Record<string, { label: string; color: string; Icon: typeof Flame }> = {
  hot: { label: 'Hot', color: 'bg-red-500/20 text-red-400 border-red-500/30', Icon: Flame },
  warm: {
    label: 'Warm',
    color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    Icon: Thermometer,
  },
  cold: { label: 'Cold', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', Icon: Snowflake },
  dead: { label: 'Dead', color: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30', Icon: Skull },
  converted: {
    label: 'Cliente',
    color: 'bg-green-500/20 text-green-400 border-green-500/30',
    Icon: CheckCircle,
  },
}

async function getFollowUps() {
  const supabase = getServiceRoleClient()
  const { data } = await supabase
    .from('leads')
    .select('id, name, company, email, lead_status, lead_score, next_follow_up_date')
    .not('next_follow_up_date', 'is', null)
    .order('next_follow_up_date', { ascending: true })
    .limit(200)
  return (data ?? []) as Array<{
    id: string
    name: string
    company: string | null
    email: string | null
    lead_status: string
    lead_score: number
    next_follow_up_date: string
  }>
}

type Bucket = 'overdue' | 'today' | 'tomorrow' | 'this_week' | 'later'

function bucketOf(iso: string): Bucket {
  const d = new Date(iso)
  if (isPast(d) && !isToday(d)) return 'overdue'
  if (isToday(d)) return 'today'
  if (isTomorrow(d)) return 'tomorrow'
  const days = (d.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
  if (days < 7) return 'this_week'
  return 'later'
}

const BUCKET_LABELS: Record<Bucket, string> = {
  overdue: 'Vencidos',
  today: 'Hoy',
  tomorrow: 'Mañana',
  this_week: 'Esta semana',
  later: 'Más adelante',
}
const BUCKET_ACCENT: Record<Bucket, string> = {
  overdue: 'text-red-400',
  today: 'text-emerald-400',
  tomorrow: 'text-sky-400',
  this_week: 'text-amber-400',
  later: 'text-zinc-400',
}

export default async function CalendarPage() {
  const followUps = await getFollowUps()
  const byBucket: Record<Bucket, typeof followUps> = {
    overdue: [],
    today: [],
    tomorrow: [],
    this_week: [],
    later: [],
  }
  for (const f of followUps) {
    byBucket[bucketOf(f.next_follow_up_date)].push(f)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Calendario</h1>
        <p className="text-zinc-400 mt-1">
          Follow-ups del CRM agrupados por urgencia. Próximamente: integración con Google Calendar.
        </p>
      </div>

      {followUps.length === 0 ? (
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-2">
            <EmptyState
              icon={Calendar}
              title="Sin follow-ups agendados"
              description="Cuando programes un follow-up desde la ficha de un lead, aparecerá aquí ordenado por urgencia."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {(Object.keys(byBucket) as Bucket[])
            .filter((b) => byBucket[b].length > 0)
            .map((bucket) => (
              <Section
                key={bucket}
                title={BUCKET_LABELS[bucket]}
                accent={BUCKET_ACCENT[bucket]}
                count={byBucket[bucket].length}
              >
                <ol className="divide-y divide-zinc-800">
                  {byBucket[bucket].map((f) => (
                    <FollowUpRow key={f.id} f={f} />
                  ))}
                </ol>
              </Section>
            ))}
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  accent,
  count,
  children,
}: {
  title: string
  accent: string
  count: number
  children: React.ReactNode
}) {
  return (
    <Card className="bg-zinc-950 border-zinc-800">
      <CardHeader className="pb-2">
        <CardTitle className={`text-sm font-medium flex items-center justify-between ${accent}`}>
          <span className="flex items-center gap-2 uppercase tracking-wider text-xs">
            <Clock className="h-3.5 w-3.5" />
            {title}
          </span>
          <span className="text-xs font-normal text-zinc-500">{count}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  )
}

function FollowUpRow({
  f,
}: {
  f: {
    id: string
    name: string
    company: string | null
    email: string | null
    lead_status: string
    lead_score: number
    next_follow_up_date: string
  }
}) {
  const status = STATUS_CONFIG[f.lead_status] ?? STATUS_CONFIG.cold
  const d = new Date(f.next_follow_up_date)
  const time = format(d, 'HH:mm', { locale: es })
  const date = isToday(d)
    ? 'Hoy'
    : isTomorrow(d)
      ? 'Mañana'
      : format(d, "EEE d MMM", { locale: es })

  return (
    <li>
      <Link
        href={`/dashboard/leads/${f.id}`}
        className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-zinc-900/50 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-white truncate">{f.name}</span>
            <Badge variant="outline" className={`${status.color} text-[10px]`}>
              <status.Icon className="h-2.5 w-2.5 mr-1" />
              {status.label}
            </Badge>
            <span className="text-[10px] uppercase tracking-wider text-zinc-600">
              score {f.lead_score}
            </span>
          </div>
          <div className="text-xs text-zinc-500 mt-0.5 truncate">
            {f.company || f.email || '—'}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-xs text-zinc-300">{date}</div>
          <div className="text-[11px] font-mono text-zinc-500">{time}</div>
        </div>
        <ChevronRight className="h-4 w-4 text-zinc-700 flex-shrink-0" />
      </Link>
    </li>
  )
}
