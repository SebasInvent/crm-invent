import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getServiceRoleClient } from '@/lib/supabase'
import { Timeline } from '@/components/timeline/Timeline'
import { Notes } from '@/components/notes/Notes'
import { LeadEditCard } from '@/components/edit/LeadEditCard'
import { LeadActionsBar } from '@/components/leads/LeadActionsBar'
import {
  ArrowLeft,
  Mail,
  Phone,
  Building2,
  Globe,
  Flame,
  Thermometer,
  Snowflake,
  Skull,
  CheckCircle,
  Calendar,
  Brain,
  TrendingUp,
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export const dynamic = 'force-dynamic'

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; Icon: typeof Flame }
> = {
  hot: { label: 'Hot', color: 'bg-red-500/20 text-red-400 border-red-500/30', Icon: Flame },
  warm: { label: 'Warm', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', Icon: Thermometer },
  cold: { label: 'Cold', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', Icon: Snowflake },
  dead: { label: 'Dead', color: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30', Icon: Skull },
  converted: { label: 'Cliente', color: 'bg-green-500/20 text-green-400 border-green-500/30', Icon: CheckCircle },
}

const ARCHETYPE_LABELS: Record<string, { label: string; icon: string }> = {
  hero_entrepreneur: { label: 'Emprendedor Visionario', icon: '🚀' },
  sage_conservative: { label: 'Empresario Conservador', icon: '🛡️' },
  caregiver_stressed: { label: 'Marketing Manager', icon: '💆' },
  artist_specialist: { label: 'Especialista Independiente', icon: '🎨' },
  ruler_executive: { label: 'Ejecutivo Results-Driven', icon: '👑' },
  explorer_merchant: { label: 'Comerciante Digital', icon: '🛍️' },
}

async function getLead(id: string) {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase.from('leads').select('*').eq('id', id).single()
  if (error || !data) return null
  return data as any
}

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const lead = await getLead(params.id)
  if (!lead) notFound()

  const status = STATUS_CONFIG[lead.lead_status] ?? STATUS_CONFIG.cold
  const archetype = lead.jung_archetype ? ARCHETYPE_LABELS[lead.jung_archetype] : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/dashboard/leads">
          <Button variant="ghost" size="icon" className="h-9 w-9 text-zinc-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-white truncate">{lead.name}</h1>
          <p className="text-sm text-zinc-500">
            {lead.company || 'Sin empresa'} · creado{' '}
            {format(new Date(lead.created_at), "d 'de' MMM yyyy", { locale: es })}
          </p>
        </div>
        <Badge variant="outline" className={status.color}>
          <status.Icon className="h-3 w-3 mr-1" />
          {status.label}
        </Badge>
      </div>

      {/* Two-column on desktop: info + timeline */}
      <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
        {/* Sidebar info */}
        <div className="space-y-4">
          <Card className="bg-zinc-950 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{lead.lead_score}/100</div>
              <div className="mt-2 h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-white"
                  style={{ width: `${Math.min(100, Math.max(0, lead.lead_score))}%` }}
                />
              </div>
              <div className="text-xs text-zinc-500 mt-2">
                Prioridad: <span className="text-zinc-300 capitalize">{lead.priority}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-950 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-zinc-400">Contacto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {lead.email && (
                <a
                  href={`mailto:${lead.email}`}
                  className="flex items-center gap-2 text-zinc-300 hover:text-white"
                >
                  <Mail className="h-3.5 w-3.5 text-zinc-500" />
                  <span className="truncate">{lead.email}</span>
                </a>
              )}
              {lead.phone && (
                <a
                  href={`tel:${lead.phone}`}
                  className="flex items-center gap-2 text-zinc-300 hover:text-white"
                >
                  <Phone className="h-3.5 w-3.5 text-zinc-500" />
                  <span>{lead.phone}</span>
                </a>
              )}
              {lead.company && (
                <div className="flex items-center gap-2 text-zinc-300">
                  <Building2 className="h-3.5 w-3.5 text-zinc-500" />
                  <span className="truncate">{lead.company}</span>
                </div>
              )}
              {lead.source_url && (
                <a
                  href={lead.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-zinc-300 hover:text-white"
                >
                  <Globe className="h-3.5 w-3.5 text-zinc-500" />
                  <span className="truncate">{lead.source_url}</span>
                </a>
              )}
            </CardContent>
          </Card>

          {archetype && (
            <Card className="bg-zinc-950 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  Arquetipo Jung
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl mb-1">{archetype.icon}</div>
                <div className="text-sm font-medium text-white">{archetype.label}</div>
              </CardContent>
            </Card>
          )}

          {lead.next_follow_up_date && (
            <Card className="bg-zinc-950 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Próximo follow-up
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-white">
                {format(new Date(lead.next_follow_up_date), "EEEE d 'de' MMM yyyy, HH:mm", {
                  locale: es,
                })}
              </CardContent>
            </Card>
          )}

          <LeadEditCard
            leadId={params.id}
            initial={{
              name: lead.name,
              email: lead.email,
              phone: lead.phone,
              company: lead.company,
              industry: lead.industry,
              lead_status: lead.lead_status,
              lead_score: lead.lead_score,
              priority: lead.priority,
              jung_archetype: lead.jung_archetype,
              next_follow_up_date: lead.next_follow_up_date,
            }}
          />
        </div>

        {/* Right column: Actions + Notes + Timeline */}
        <div className="space-y-6 min-w-0">
          <LeadActionsBar
            leadId={params.id}
            leadName={lead.name}
            isConverted={lead.lead_status === 'converted' || !!lead.converted_to_client_id}
            contactId={lead.contact_id ?? null}
            currentFollowUp={lead.next_follow_up_date ?? null}
          />

          <section>
            <h2 className="text-sm font-medium text-zinc-400 mb-4 uppercase tracking-wider">
              Notas
            </h2>
            <Notes leadId={params.id} />
          </section>

          <section>
            <h2 className="text-sm font-medium text-zinc-400 mb-4 uppercase tracking-wider">
              Actividad
            </h2>
            <Timeline leadId={params.id} />
          </section>
        </div>
      </div>
    </div>
  )
}
