import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getServiceRoleClient } from '@/lib/supabase'
import { Timeline } from '@/components/timeline/Timeline'
import { Notes } from '@/components/notes/Notes'
import { DealActionsBar } from '@/components/deals/DealActionsBar'
import {
  ArrowLeft,
  DollarSign,
  TrendingUp,
  User,
  Calendar,
  Building2,
  Mail,
  Phone,
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export const dynamic = 'force-dynamic'

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  won: 'bg-green-500/20 text-green-400 border-green-500/30',
  lost: 'bg-red-500/20 text-red-400 border-red-500/30',
  paused: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
}

async function getDeal(id: string) {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('deals_full')
    .select('*')
    .eq('id', id)
    .single()
  if (error || !data) return null
  return data as Record<string, unknown> & {
    id: string
    name: string
    status: string
    value: number
    currency: string
    probability: number
    stage_id: string | null
    contact_id: string | null
    contact_first_name: string | null
    contact_last_name: string | null
    contact_email: string | null
    contact_phone: string | null
    contact_company: string | null
    expected_close_date: string | null
    actual_close_date: string | null
    description: string | null
    created_at: string
    updated_at: string
  }
}

async function getStage(stageId: string | null) {
  if (!stageId) return null
  const supabase = getServiceRoleClient()
  const { data } = await supabase
    .from('pipeline_stages')
    .select('id, name, color, default_probability')
    .eq('id', stageId)
    .single()
  return data as { id: string; name: string; color: string; default_probability: number } | null
}

export default async function DealDetailPage({ params }: { params: { id: string } }) {
  const deal = await getDeal(params.id)
  if (!deal) notFound()

  const stage = await getStage(deal.stage_id)
  const contactName = [deal.contact_first_name, deal.contact_last_name]
    .filter(Boolean)
    .join(' ')
    .trim()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/dashboard/pipeline">
          <Button variant="ghost" size="icon" className="h-9 w-9 text-zinc-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-white truncate">{deal.name}</h1>
          <p className="text-sm text-zinc-500">
            {contactName || 'Sin contacto'}
            {deal.contact_company ? ` · ${deal.contact_company}` : ''} · creado{' '}
            {format(new Date(deal.created_at), "d 'de' MMM yyyy", { locale: es })}
          </p>
        </div>
        <Badge variant="outline" className={STATUS_COLORS[deal.status] ?? STATUS_COLORS.open}>
          {deal.status}
        </Badge>
      </div>

      {/* Inline action toolbar — quick state mutations on the deal */}
      <DealActionsBar dealId={params.id} dealName={deal.name} status={deal.status} />

      <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
        {/* Sidebar */}
        <div className="space-y-4">
          <Card className="bg-zinc-950 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Valor
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">
                ${(deal.value ?? 0).toLocaleString()}{' '}
                <span className="text-sm font-normal text-zinc-500">{deal.currency}</span>
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                Ponderado: ${Math.round(((deal.value ?? 0) * (deal.probability ?? 0)) / 100).toLocaleString()}
              </div>
            </CardContent>
          </Card>

          {stage && (
            <Card className="bg-zinc-950 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Etapa
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: stage.color }}
                  />
                  <span className="text-sm font-medium text-white">{stage.name}</span>
                </div>
                <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-white"
                    style={{ width: `${Math.min(100, Math.max(0, deal.probability ?? 0))}%` }}
                  />
                </div>
                <div className="text-xs text-zinc-500 mt-2">{deal.probability ?? 0}% probabilidad</div>
              </CardContent>
            </Card>
          )}

          {deal.contact_id && (
            <Card className="bg-zinc-950 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Contacto
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Link
                  href={`/dashboard/contacts/${deal.contact_id}`}
                  className="block text-white font-medium hover:underline truncate"
                >
                  {contactName || '(sin nombre)'}
                </Link>
                {deal.contact_company && (
                  <div className="flex items-center gap-2 text-zinc-300">
                    <Building2 className="h-3.5 w-3.5 text-zinc-500" />
                    <span className="truncate">{deal.contact_company}</span>
                  </div>
                )}
                {deal.contact_email && (
                  <a
                    href={`mailto:${deal.contact_email}`}
                    className="flex items-center gap-2 text-zinc-300 hover:text-white"
                  >
                    <Mail className="h-3.5 w-3.5 text-zinc-500" />
                    <span className="truncate">{deal.contact_email}</span>
                  </a>
                )}
                {deal.contact_phone && (
                  <a
                    href={`tel:${deal.contact_phone}`}
                    className="flex items-center gap-2 text-zinc-300 hover:text-white"
                  >
                    <Phone className="h-3.5 w-3.5 text-zinc-500" />
                    <span>{deal.contact_phone}</span>
                  </a>
                )}
              </CardContent>
            </Card>
          )}

          {(deal.expected_close_date || deal.actual_close_date) && (
            <Card className="bg-zinc-950 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Fechas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {deal.expected_close_date && (
                  <div>
                    <span className="text-zinc-500 text-xs uppercase tracking-wider">
                      Cierre estimado
                    </span>
                    <div className="text-white">
                      {format(new Date(deal.expected_close_date), "d 'de' MMM yyyy", { locale: es })}
                    </div>
                  </div>
                )}
                {deal.actual_close_date && (
                  <div>
                    <span className="text-zinc-500 text-xs uppercase tracking-wider">Cerrado</span>
                    <div className="text-white">
                      {format(new Date(deal.actual_close_date), "d 'de' MMM yyyy", { locale: es })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {deal.description && (
            <Card className="bg-zinc-950 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-zinc-400">Descripción</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
                  {deal.description}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column: Notes + Timeline (use contact_id if available) */}
        <div className="space-y-8 min-w-0">
          <section>
            <h2 className="text-sm font-medium text-zinc-400 mb-4 uppercase tracking-wider">
              Notas
            </h2>
            <Notes dealId={params.id} />
          </section>

          {deal.contact_id && (
            <section>
              <h2 className="text-sm font-medium text-zinc-400 mb-4 uppercase tracking-wider">
                Actividad del contacto
              </h2>
              <Timeline contactId={deal.contact_id} />
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
