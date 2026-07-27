import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  ArrowUpRight,
  Building2,
  CalendarClock,
  CircleDollarSign,
  FileCheck2,
  Globe2,
  Layers3,
  Target,
  Users,
} from 'lucide-react'
import { getActiveOrg } from '@/lib/api-auth'
import { getServiceRoleClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

type Deal = {
  id: string
  name: string
  value: number | string | null
  currency: string | null
  probability: number | null
  status: string | null
  stage_id: string | null
  operating_entity_id: string | null
}

type Submission = {
  id: string
  name: string
  company: string | null
  market: 'US' | 'CO' | 'INTL'
  recommended_program: string
  lead_score: number
  classification: string
  created_at: string
}

function money(value: number, currency: 'USD' | 'COP') {
  return new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'es-CO', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat('es-CO', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  }).format(new Date(value))
}

export default async function YumkOperationsPage() {
  const active = await getActiveOrg()
  if (active.error) redirect('/login')

  const supabase = getServiceRoleClient()
  const { data: organization } = await (supabase.from('organizations') as any)
    .select('id, name, slug, legal_name, reporting_currency, timezone')
    .eq('id', active.orgId)
    .single()

  if (organization?.slug !== 'yumk') {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-10">
          <Globe2 className="h-10 w-10 text-zinc-600" />
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">Operación Yumk</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-white">Cambia al workspace Yumk Group</h1>
          <p className="mt-4 max-w-2xl text-zinc-400">
            El workspace activo es {organization?.name ?? 'otro equipo'}. Usa el selector bajo el logo para entrar a la operación USA + Colombia sin mezclar información con Invent.
          </p>
        </div>
      </div>
    )
  }

  const [entitiesResult, submissionsResult, leadsResult, dealsResult, stagesResult, projectsResult, invoicesResult] = await Promise.all([
    (supabase.from('operating_entities') as any)
      .select('id, code, name, legal_name, currency, timezone')
      .eq('org_id', active.orgId)
      .eq('is_active', true)
      .order('code', { ascending: false }),
    (supabase.from('diagnostic_submissions') as any)
      .select('id, name, company, market, recommended_program, lead_score, classification, created_at')
      .eq('org_id', active.orgId)
      .order('created_at', { ascending: false })
      .limit(8),
    (supabase.from('leads') as any)
      .select('id, lead_status, lead_score, operating_entity_id, created_at')
      .eq('org_id', active.orgId)
      .limit(1000),
    (supabase.from('deals') as any)
      .select('id, name, value, currency, probability, status, stage_id, operating_entity_id')
      .eq('org_id', active.orgId)
      .limit(1000),
    (supabase.from('pipeline_stages') as any)
      .select('id, name, order_index, color')
      .eq('org_id', active.orgId)
      .eq('is_active', true)
      .order('order_index'),
    (supabase.from('projects') as any)
      .select('id, status', { count: 'exact' })
      .eq('org_id', active.orgId)
      .limit(1000),
    (supabase.from('invoices') as any)
      .select('id, total_amount, amount_paid, currency, status')
      .eq('org_id', active.orgId)
      .limit(1000),
  ])

  const entities = (entitiesResult.data ?? []) as Array<{ id: string; code: string; name: string; legal_name: string; currency: 'USD' | 'COP'; timezone: string }>
  const submissions = (submissionsResult.data ?? []) as Submission[]
  const leads = (leadsResult.data ?? []) as Array<{ id: string; lead_status: string; lead_score: number; operating_entity_id: string | null; created_at: string }>
  const deals = (dealsResult.data ?? []) as Deal[]
  const stages = (stagesResult.data ?? []) as Array<{ id: string; name: string; order_index: number; color: string }>
  const projects = projectsResult.data ?? []
  const invoices = (invoicesResult.data ?? []) as Array<{ total_amount: number | string; amount_paid: number | string; currency: 'USD' | 'COP'; status: string }>

  const openDeals = deals.filter((deal) => deal.status === 'open')
  const pipelineUsd = openDeals.filter((deal) => deal.currency === 'USD').reduce((sum, deal) => sum + Number(deal.value ?? 0), 0)
  const pipelineCop = openDeals.filter((deal) => deal.currency === 'COP').reduce((sum, deal) => sum + Number(deal.value ?? 0), 0)
  const weightedUsd = openDeals.filter((deal) => deal.currency === 'USD').reduce((sum, deal) => sum + Number(deal.value ?? 0) * Number(deal.probability ?? 0) / 100, 0)
  const hotLeads = leads.filter((lead) => lead.lead_status === 'hot').length
  const activeProjects = projects.filter((project: any) => !['completed', 'cancelled', 'archived'].includes(project.status)).length
  const outstandingUsd = invoices.filter((invoice) => invoice.currency === 'USD' && invoice.status !== 'paid').reduce((sum, invoice) => sum + Math.max(0, Number(invoice.total_amount) - Number(invoice.amount_paid)), 0)
  const outstandingCop = invoices.filter((invoice) => invoice.currency === 'COP' && invoice.status !== 'paid').reduce((sum, invoice) => sum + Math.max(0, Number(invoice.total_amount) - Number(invoice.amount_paid)), 0)
  return (
    <div className="mx-auto max-w-[1500px] space-y-7">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-lime-300">
            <span className="h-2 w-2 rounded-full bg-lime-300 shadow-[0_0_18px_rgba(190,242,100,.8)]" />
            Workspace activo · USA + Colombia
          </div>
          <h1 className="mt-3 text-4xl font-bold tracking-[-0.04em] text-white">Yumk Global Operations</h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-400">
            Diagnóstico, venta, propuesta, facturación y ejecución en una sola fuente de verdad, separados por entidad y moneda.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/leads" className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-900">
            Revisar leads <ArrowUpRight className="h-4 w-4" />
          </Link>
          <Link href="/dashboard/pipeline?product=yumk-digital-foundation" className="inline-flex items-center gap-2 rounded-lg bg-lime-300 px-4 py-2.5 text-sm font-semibold text-black hover:bg-lime-200">
            Abrir pipeline <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={<Target className="h-5 w-5" />} label="Leads activos" value={String(leads.length)} detail={`${hotLeads} de prioridad inmediata`} />
        <Kpi icon={<CircleDollarSign className="h-5 w-5" />} label="Pipeline USD" value={money(pipelineUsd, 'USD')} detail={`${money(weightedUsd, 'USD')} ponderado`} />
        <Kpi icon={<Layers3 className="h-5 w-5" />} label="Proyectos activos" value={String(activeProjects)} detail={`${projects.length} proyectos en total`} />
        <Kpi icon={<FileCheck2 className="h-5 w-5" />} label="Cartera pendiente" value={money(outstandingUsd, 'USD')} detail={outstandingCop ? `${money(outstandingCop, 'COP')} adicionales` : 'sin saldo COP'} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {entities.map((entity) => {
          const entityDeals = openDeals.filter((deal) => deal.operating_entity_id === entity.id)
          const entityLeads = leads.filter((lead) => lead.operating_entity_id === entity.id)
          const total = entityDeals.reduce((sum, deal) => sum + Number(deal.value ?? 0), 0)
          return (
            <article key={entity.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-900 text-zinc-300"><Building2 className="h-5 w-5" /></div>
                  <div><h2 className="font-semibold text-white">{entity.name}</h2><p className="text-xs text-zinc-500">{entity.legal_name}</p></div>
                </div>
                <span className="rounded-full border border-zinc-800 px-2.5 py-1 text-[10px] font-bold tracking-widest text-zinc-400">{entity.code} · {entity.currency}</span>
              </div>
              <div className="mt-7 grid grid-cols-3 gap-3">
                <Metric label="Leads" value={String(entityLeads.length)} />
                <Metric label="Deals" value={String(entityDeals.length)} />
                <Metric label={`Valor ${entity.currency}`} value={money(total, entity.currency)} compact />
              </div>
              <p className="mt-5 text-xs text-zinc-600">Zona operativa: {entity.timezone}</p>
            </article>
          )
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
        <article className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-900 px-6 py-5">
            <div><h2 className="font-semibold text-white">Diagnósticos recientes</h2><p className="mt-1 text-xs text-zinc-500">Entrada automática desde yumkgroup.vercel.app</p></div>
            <Link href="/dashboard/leads" className="text-xs font-medium text-zinc-400 hover:text-white">Ver leads →</Link>
          </div>
          {submissions.length === 0 ? (
            <div className="px-6 py-16 text-center"><Users className="mx-auto h-8 w-8 text-zinc-700" /><p className="mt-4 text-sm text-zinc-500">El próximo diagnóstico aparecerá aquí con score, mercado y programa.</p></div>
          ) : (
            <div className="divide-y divide-zinc-900">
              {submissions.map((submission) => (
                <div key={submission.id} className="grid gap-3 px-6 py-4 hover:bg-zinc-900/30 md:grid-cols-[1fr_1fr_auto] md:items-center">
                  <div><p className="text-sm font-medium text-white">{submission.company || submission.name}</p><p className="mt-1 text-xs text-zinc-500">{submission.name} · {submission.market} · {dateTime(submission.created_at)}</p></div>
                  <div><p className="text-xs text-zinc-300">{submission.recommended_program}</p><p className="mt-1 text-[11px] text-zinc-600">{submission.classification}</p></div>
                  <span className={`w-fit rounded-md px-2 py-1 text-xs font-bold ${submission.lead_score >= 80 ? 'bg-orange-500/15 text-orange-300' : submission.lead_score >= 60 ? 'bg-lime-400/10 text-lime-300' : 'bg-zinc-800 text-zinc-400'}`}>{submission.lead_score}</span>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
          <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-lime-300" /><h2 className="font-semibold text-white">Embudo consolidado</h2></div>
          <div className="mt-6 space-y-4">
            {stages.slice(0, 8).map((stage) => {
              const count = openDeals.filter((deal) => deal.stage_id === stage.id).length
              const width = openDeals.length ? Math.max(4, Math.round((count / openDeals.length) * 100)) : 4
              return (
                <div key={stage.id}>
                  <div className="flex items-center justify-between text-xs"><span className="text-zinc-400">{stage.name}</span><span className="font-mono text-zinc-600">{count}</span></div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-900"><div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: stage.color }} /></div>
                </div>
              )
            })}
          </div>
          <div className="mt-7 rounded-xl border border-zinc-800 bg-black p-4 text-xs text-zinc-500">
            Pipeline adicional en COP: <span className="font-medium text-zinc-300">{money(pipelineCop, 'COP')}</span>. Los diagnósticos públicos nacen en USD; la moneda puede cambiar al validar la entidad contractual.
          </div>
        </article>
      </section>
    </div>
  )
}

function Kpi({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5"><div className="flex items-center justify-between text-zinc-500"><span className="text-xs uppercase tracking-[0.14em]">{label}</span>{icon}</div><p className="mt-5 truncate text-2xl font-bold tracking-tight text-white">{value}</p><p className="mt-1 text-xs text-zinc-600">{detail}</p></article>
}

function Metric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return <div><p className="text-[10px] uppercase tracking-[0.15em] text-zinc-600">{label}</p><p className={`mt-2 font-semibold text-white ${compact ? 'truncate text-sm' : 'text-xl'}`} title={value}>{value}</p></div>
}
