import Link from 'next/link'
import type { Metadata } from 'next'
import {
  ArrowRight,
  Check,
  Minus,
  MessageCircle,
  ScanFace,
  ShieldCheck,
  Sparkles,
  Mail,
  Phone,
  Globe,
  CreditCard,
  Calendar,
  Bot,
  Workflow,
  BarChart3,
  LineChart,
  ChevronDown,
} from 'lucide-react'

export const metadata: Metadata = {
  title: 'CRM Invent · Propuesta de Implementación',
  description:
    'El primer CRM en Colombia con histórico de WhatsApp + IA por contacto y login facial biométrico. Implementación personalizada desde US$4.000.',
}

const MARKET_STATS = [
  { value: '92%', label: 'penetración de WhatsApp en Colombia' },
  { value: '74%', label: 'de los negocios vende por WhatsApp' },
  { value: 'US$18.2B', label: 'comercio conversacional LATAM 2025' },
  { value: '+133%', label: 'adopción WhatsApp API en MiPymes 2023–25' },
]

const DIFFERENTIATORS = [
  {
    icon: MessageCircle,
    title: 'Histórico WhatsApp + IA por contacto',
    blurb: 'Memoria e inteligencia por cliente, no solo bandeja compartida.',
    points: [
      'Hilo completo de WhatsApp dentro de la ficha del cliente, en vivo.',
      'IA que ya leyó la conversación: resumen, intención, etapa, sentimiento.',
      'Próxima mejor acción sugerida al abrir el contacto.',
    ],
    tag: 'En producción',
  },
  {
    icon: ScanFace,
    title: 'Login facial biométrico',
    blurb: 'Único CRM en Colombia con InsightFace ArcFace 512-d.',
    points: [
      'Entra al CRM mirando la cámara, en segundos.',
      'Prueba de vida (liveness) y anti-suplantación.',
      '100% en navegador: la foto nunca sale del dispositivo.',
    ],
    tag: 'Diferencial único',
  },
  {
    icon: ShieldCheck,
    title: 'Habeas Data by-design',
    blurb: 'Cumple Ley 1581 desde la arquitectura, no como casilla final.',
    points: [
      'Consentimiento explícito y separado por finalidad.',
      'Multi-tenant aislado por fila (Row Level Security).',
      'Derecho al olvido con prueba auditable.',
    ],
    tag: 'Hasta 5% de multa evitable',
  },
]

const COMPARISON_ROWS: Array<{
  feature: string
  invent: string
  kommo: string
  keybe: string
  b2chat: string
  wati: string
  highlight?: boolean
}> = [
  { feature: 'CRM + embudo + tareas', invent: '✓', kommo: '✓', keybe: '✓', b2chat: '✓', wati: 'Parcial' },
  { feature: 'Bandeja WhatsApp', invent: '✓', kommo: '✓', keybe: '✓', b2chat: '✓', wati: '✓' },
  {
    feature: 'Histórico WhatsApp + IA brief por contacto',
    invent: '✓',
    kommo: 'Parcial',
    keybe: 'Parcial',
    b2chat: '–',
    wati: '–',
    highlight: true,
  },
  { feature: 'Login facial biométrico', invent: '✓', kommo: '–', keybe: '–', b2chat: '–', wati: '–', highlight: true },
  {
    feature: 'Cumplimiento Habeas Data by-design',
    invent: '✓',
    kommo: '–',
    keybe: '–',
    b2chat: '–',
    wati: '–',
    highlight: true,
  },
  { feature: 'Integraciones locales (Wompi, PSE, Nequi)', invent: '✓', kommo: '–', keybe: 'Parcial', b2chat: 'Parcial', wati: '–' },
  { feature: 'Integración DIAN (facturación)', invent: '✓ (Full)', kommo: '–', keybe: '–', b2chat: '–', wati: '–' },
  { feature: 'Implementación personalizada a vertical', invent: '✓', kommo: '–', keybe: '–', b2chat: '–', wati: '–' },
  { feature: 'IA en español colombiano', invent: '✓', kommo: 'Genérica', keybe: '✓', b2chat: '–', wati: 'Genérica' },
]

const TIERS = [
  {
    id: 'nucleo',
    name: 'Núcleo',
    priceUSD: 'US$4.000',
    priceCOP: '≈ COP 16.000.000',
    blurb: 'Para la PYME que quiere el diferenciador WhatsApp + IA y CRM esencial bien hecho, con login facial premium.',
    monthly: 'US$59–79 / mes',
    features: [
      'CRM: contactos, empresas, embudo kanban, tareas, notas',
      'Importación CSV + personalización con tu marca',
      'WhatsApp (1 número) + histórico por contacto',
      'IA nivel 1: resumen + intención + etapa + sentimiento',
      'Login facial básico (hasta 5 usuarios) + Habeas Data',
      'Capacitación 2h + 1 mes de soporte',
    ],
    featured: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    priceUSD: 'US$6.000',
    priceCOP: '≈ COP 24.000.000',
    blurb: 'Para el equipo comercial con varios asesores que automatiza, mide y opera con seguridad biométrica multi-usuario.',
    monthly: 'US$129–149 / mes',
    features: [
      'Todo lo del Núcleo',
      'Multi-agente / multi-número WhatsApp',
      'Plantillas aprobadas + campañas segmentadas',
      'IA nivel 2: próxima acción + lead scoring + alertas',
      'Automatizaciones (bienvenida, recordatorios, recuperación)',
      'Pagos Wompi o agenda de citas',
      'Reportes y tablero',
      'Login facial multi-usuario (25) + confirmación facial de acciones',
      '1 integración a elegir + 2 meses de soporte',
    ],
    featured: true,
  },
  {
    id: 'full',
    name: 'Full',
    priceUSD: 'US$8.000',
    priceCOP: '≈ COP 32.000.000',
    blurb: 'Para operaciones que quieren agente IA 24/7, analítica predictiva, integraciones completas y auditoría biométrica avanzada.',
    monthly: 'US$249–349 / mes',
    features: [
      'Todo lo del Pro',
      'Agente IA conversacional 24/7 con handoff',
      'IA nivel 3: predicción de cierre + churn + copiloto',
      'Integraciones avanzadas: DIAN + Wompi + Meta Ads + correo',
      'Onboarding multi-cliente (Embedded Signup)',
      'Panel de cumplimiento y RNBD avanzado',
      'Login facial ilimitado + agente IA biométrico + auditoría facial',
      'App móvil PWA + SLA 24/7',
      '3 meses de soporte',
    ],
    featured: false,
  },
]

const FEATURE_MATRIX: Array<{ feature: string; nucleo: string; pro: string; full: string }> = [
  { feature: 'Inversión única', nucleo: 'US$4.000', pro: 'US$6.000', full: 'US$8.000' },
  { feature: 'Equivalente COP', nucleo: '~16M', pro: '~24M', full: '~32M' },
  { feature: 'CRM + embudo + tareas + búsqueda', nucleo: '✓', pro: '✓', full: '✓' },
  { feature: 'Personalización con tu marca', nucleo: '✓', pro: '✓', full: '✓' },
  { feature: 'WhatsApp 1 número + histórico por contacto', nucleo: '✓', pro: '✓', full: '✓' },
  { feature: 'IA nivel 1: resumen/intención/etapa/sentimiento', nucleo: '✓', pro: '✓', full: '✓' },
  {
    feature: 'Login facial',
    nucleo: 'Básico (5 usuarios)',
    pro: 'Multi (25) + confirmación facial',
    full: 'Ilimitado + agente IA biométrico',
  },
  { feature: 'Cumplimiento Habeas Data', nucleo: 'Básico', pro: 'Básico', full: 'Avanzado + panel SIC' },
  { feature: 'Multi-agente / multi-número WhatsApp', nucleo: '–', pro: '✓', full: '✓' },
  { feature: 'Plantillas + campañas + automatizaciones', nucleo: '–', pro: '✓', full: '✓' },
  { feature: 'IA nivel 2: próxima acción + scoring + alertas', nucleo: '–', pro: '✓', full: '✓' },
  { feature: 'Pagos Wompi o agenda', nucleo: '–', pro: '✓', full: '✓' },
  { feature: 'Reportes y tablero', nucleo: '–', pro: '✓', full: '✓' },
  { feature: 'Integración externa (DIAN/Ads/Sheets/correo)', nucleo: '–', pro: '1', full: 'Avanzadas' },
  { feature: 'Agente IA conversacional 24/7 + handoff', nucleo: '–', pro: '–', full: '✓' },
  { feature: 'IA nivel 3: predicción de cierre + churn + copiloto', nucleo: '–', pro: '–', full: '✓' },
  { feature: 'Onboarding multi-cliente (Embedded Signup)', nucleo: '–', pro: '–', full: '✓' },
  { feature: 'App móvil PWA', nucleo: '–', pro: '–', full: '✓' },
  { feature: 'Soporte incluido', nucleo: '1 mes', pro: '2 meses', full: '3 meses' },
]

const TIMELINE = [
  {
    level: 'Núcleo',
    weeks: '1–2 semanas',
    milestones: [
      'Sem 1: setup + WABA + marca + datos',
      'Sem 2: ingesta WhatsApp + IA nivel 1 + login facial + capacitación + go-live',
    ],
  },
  {
    level: 'Pro',
    weeks: '2–3 semanas',
    milestones: [
      'Sem 1: setup + WABA + marca',
      'Sem 2: multi-agente + plantillas + Wompi/agenda',
      'Sem 3: IA nivel 2 + automatizaciones + integración + capacitación + go-live',
    ],
  },
  {
    level: 'Full',
    weeks: '3–4 semanas',
    milestones: [
      'Sem 1: setup + Embedded Signup',
      'Sem 2: multi-agente + Wompi + DIAN',
      'Sem 3: agente IA 24/7 + IA nivel 3 + auditoría biométrica',
      'Sem 4: PWA + integraciones avanzadas + capacitación + go-live',
    ],
  },
]

const STACK = [
  { capa: 'Frontend web/móvil', tech: 'Next.js + Tailwind + shadcn', why: 'Estándar moderno, rápido y accesible' },
  { capa: 'Datos / Auth / Storage', tech: 'Supabase (Postgres + RLS + Realtime)', why: 'Multi-tenant aislado, tiempo real' },
  { capa: 'WhatsApp', tech: 'Meta Cloud API + Evolution', why: 'Conexión directa sin intermediarios' },
  { capa: 'Login facial', tech: 'InsightFace ArcFace + Mediapipe', why: 'Estándar de industria, foto nunca sale del dispositivo' },
  { capa: 'Inteligencia artificial', tech: 'Claude Haiku / Sonnet / Opus', why: 'Excelente en español colombiano, costo controlado' },
  { capa: 'Pagos', tech: 'Wompi (Bancolombia) + Stripe', why: 'Estándar local y global' },
  { capa: 'Hosting', tech: 'Vercel + Supabase', why: 'Despliegue global, alta disponibilidad' },
]

const SLA: Array<{ rubro: string; nucleo: string; pro: string; full: string }> = [
  { rubro: 'Soporte incluido', nucleo: '1 mes', pro: '2 meses', full: '3 meses + SLA 24/7' },
  { rubro: 'Garantía de errores', nucleo: '90 días', pro: '90 días', full: '90 días' },
  { rubro: 'Canal de soporte', nucleo: 'Email + WhatsApp', pro: 'Email + WhatsApp', full: '+ línea directa' },
  { rubro: 'Respuesta crítica', nucleo: '24h hábiles', pro: '12h hábiles', full: '4h, 24/7' },
  { rubro: 'Respuesta no crítica', nucleo: '48h hábiles', pro: '24h hábiles', full: '12h hábiles' },
  { rubro: 'Capacitación', nucleo: '1 sesión 2h', pro: '2 sesiones 2h', full: '3 sesiones + manual' },
]

const FOOTNOTES = [
  {
    n: 1,
    text: 'DataReportal — Digital 2026 Colombia · YCloud — WhatsApp Statistics 2026 · Mazkara — Penetration LATAM',
  },
  { n: 2, text: 'Mordor Intelligence — Conversational Commerce · Aurora Inbox — WhatsApp Ecommerce LATAM 2025' },
  { n: 3, text: 'CIPE — Routes for Digital Adoption for SMEs in Colombia' },
  { n: 4, text: 'U. Externado — Modernización Ley 1581 (PL 247/2025) · SIC — Reforma protección de datos' },
  { n: 5, text: 'Pricing pages oficiales de Kommo, Keybe, B2Chat, Wati, respond.io' },
  { n: 6, text: 'Meta for Developers — Per-message pricing · YCloud — Pricing update jul-2025' },
]

/* ----------------------------- componentes utilitarios ---------------------------- */

function MarkCell({ value, strong = false }: { value: string; strong?: boolean }) {
  if (value === '✓') {
    return (
      <span
        className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${
          strong ? 'bg-cyan-400/15 text-cyan-300 ring-1 ring-cyan-400/30' : 'bg-emerald-400/10 text-emerald-300'
        }`}
      >
        <Check className="h-3.5 w-3.5" />
      </span>
    )
  }
  if (value === '–') {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800/60 text-zinc-600">
        <Minus className="h-3.5 w-3.5" />
      </span>
    )
  }
  return (
    <span
      className={`text-xs ${strong ? 'font-semibold text-cyan-300' : 'text-zinc-400'}`}
    >
      {value}
    </span>
  )
}

function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      {eyebrow && (
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-400">{eyebrow}</p>
      )}
      <h2 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">{title}</h2>
      {subtitle && <p className="mt-4 text-zinc-400">{subtitle}</p>}
    </div>
  )
}

/* ----------------------------------- página ----------------------------------- */

export default function PropuestaImplementacion() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
      {/* fondo atmosférico */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[140px]" />
        <div className="absolute top-1/3 -left-32 h-[400px] w-[400px] rounded-full bg-cyan-400/5 blur-[120px]" />
      </div>

      {/* ─────────── NAV ─────────── */}
      <header className="sticky top-0 z-40 border-b border-zinc-900/80 bg-zinc-950/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="inline-block h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.7)]" />
            CRM <span className="text-cyan-400">Invent</span>
            <span className="ml-3 hidden text-xs font-normal text-zinc-500 sm:inline">·  Propuesta de implementación</span>
          </div>
          <nav className="hidden items-center gap-7 text-xs text-zinc-400 md:flex">
            <a href="#solucion" className="transition hover:text-white">Solución</a>
            <a href="#niveles" className="transition hover:text-white">Niveles</a>
            <a href="#plan" className="transition hover:text-white">Plan</a>
            <a href="#contacto" className="transition hover:text-white">Contacto</a>
          </nav>
          <a
            href="#contacto"
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-400/20"
          >
            Agendar demo <ArrowRight className="h-3 w-3" />
          </a>
        </div>
      </header>

      {/* ─────────── HERO ─────────── */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-20 sm:pt-28">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-400">
          <Sparkles className="h-3 w-3 text-cyan-400" />
          Propuesta de implementación · 2026
        </div>
        <h1 className="max-w-4xl text-balance text-4xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
          El primer CRM en Colombia con <span className="text-cyan-400">histórico de WhatsApp + IA</span> por contacto y <span className="text-cyan-400">login facial biométrico</span>.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-zinc-400">
          Implementación personalizada desde <span className="font-semibold text-white">US$4.000</span> hasta US$8.000.
          Construido como producto reutilizable: pagas por tu implementación, no por la I+D.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a
            href="#contacto"
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-cyan-950 shadow-[0_0_30px_rgba(34,211,238,0.3)] transition hover:bg-cyan-300"
          >
            Agendar demo de 30 minutos <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href="#niveles"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-3 text-sm font-medium text-zinc-200 transition hover:border-zinc-700"
          >
            Ver niveles y precios
          </a>
        </div>

        {/* metadata propuesta */}
        <div className="mt-12 grid gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-5 text-xs text-zinc-400 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-mono uppercase tracking-wider text-zinc-600">Preparado por</p>
            <p className="mt-1 text-zinc-100">Invent Agency</p>
          </div>
          <div>
            <p className="font-mono uppercase tracking-wider text-zinc-600">Validez de la oferta</p>
            <p className="mt-1 text-zinc-100">30 días calendario</p>
          </div>
          <div>
            <p className="font-mono uppercase tracking-wider text-zinc-600">TRM de referencia</p>
            <p className="mt-1 text-zinc-100">~COP 4.000 / US$1</p>
          </div>
          <div>
            <p className="font-mono uppercase tracking-wider text-zinc-600">Contacto comercial</p>
            <p className="mt-1 text-zinc-100">inventagency20@gmail.com</p>
          </div>
        </div>
      </section>

      {/* ─────────── EL PROBLEMA / MERCADO ─────────── */}
      <section className="border-y border-zinc-900 bg-zinc-950/50">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <SectionHeader
            eyebrow="El problema"
            title="El canal donde de verdad vendes vive fuera del CRM"
            subtitle="WhatsApp es el canal dominante en Colombia. Pero la conversación que cierra la venta vive en los teléfonos de los vendedores. Cuando un asesor abre la ficha del cliente, arranca de cero."
          />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MARKET_STATS.map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 transition hover:border-zinc-700"
              >
                <p className="text-4xl font-bold tracking-tight text-cyan-400">{s.value}</p>
                <p className="mt-2 text-sm text-zinc-400">{s.label}</p>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-12 max-w-3xl text-center text-sm text-zinc-500">
            Y hay un problema legal: la <span className="text-zinc-300">Ley 1581 (Habeas Data)</span> y su reforma{' '}
            <span className="text-zinc-300">(PL 247/2025)</span> elevan las sanciones hasta el{' '}
            <span className="font-semibold text-rose-300">5% de los ingresos</span> de la empresa por mal tratamiento
            de datos personales — incluido el rostro de tus colaboradores.<sup className="text-cyan-400">4</sup>
          </p>
        </div>
      </section>

      {/* ─────────── SOLUCIÓN — 3 DIFERENCIADORES ─────────── */}
      <section id="solucion" className="mx-auto max-w-6xl px-6 py-24">
        <SectionHeader
          eyebrow="La solución"
          title="Tres diferenciadores que nadie más combina"
          subtitle="No es otra bandeja compartida de chats. Es memoria, inteligencia y cumplimiento — todo en un mismo producto, implementado a la medida de tu organización."
        />
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {DIFFERENTIATORS.map((d, i) => (
            <div
              key={d.title}
              className="group relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40 p-7 transition hover:border-cyan-400/30 hover:bg-zinc-900/60"
            >
              <div className="absolute -right-12 -top-12 h-28 w-28 rounded-full bg-cyan-400/10 blur-2xl transition-opacity group-hover:bg-cyan-400/20" />
              <div className="relative">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
                  <d.icon className="h-5 w-5" />
                </span>
                <p className="mt-5 font-mono text-[10px] uppercase tracking-wider text-cyan-400">
                  Diferenciador {i + 1}
                </p>
                <h3 className="mt-1 text-xl font-semibold text-white">{d.title}</h3>
                <p className="mt-2 text-sm text-zinc-400">{d.blurb}</p>
                <ul className="mt-5 space-y-2.5">
                  {d.points.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-sm text-zinc-300">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {d.tag}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-12 max-w-3xl rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5 text-sm text-amber-100/80">
          <p className="font-semibold text-amber-200">Honestidad sobre los límites del login facial</p>
          <p className="mt-2">
            El liveness y el anti-suplantación son <span className="font-medium">heurísticos</span>, no certificación bancaria —
            pueden engañarse con una foto impresa de alta calidad o pantalla a corta distancia. Por eso la
            contraseña queda como respaldo siempre, y para operaciones críticas (pagos, borrado masivo) el CRM
            exige una segunda confirmación. Lo posicionamos como <span className="font-medium">factor de conveniencia y velocidad</span>,
            no como única defensa.
          </p>
        </div>
      </section>

      {/* ─────────── COMPARATIVA ─────────── */}
      <section id="comparativa" className="border-y border-zinc-900 bg-zinc-950/50">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <SectionHeader
            eyebrow="Por qué Invent"
            title="Lo que ningún otro CRM en Colombia hace hoy"
          />
          <div className="mt-12 overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                  <th className="px-5 py-4 font-medium">Capacidad</th>
                  <th className="px-3 py-4 text-center font-semibold text-cyan-300">CRM Invent</th>
                  <th className="px-3 py-4 text-center font-medium">Kommo</th>
                  <th className="px-3 py-4 text-center font-medium">Keybe</th>
                  <th className="px-3 py-4 text-center font-medium">B2Chat</th>
                  <th className="px-3 py-4 text-center font-medium">Wati</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row) => (
                  <tr
                    key={row.feature}
                    className={`border-b border-zinc-900/60 last:border-0 ${
                      row.highlight ? 'bg-cyan-400/[0.04]' : ''
                    }`}
                  >
                    <td className="px-5 py-3.5 text-zinc-300">
                      {row.highlight && (
                        <span className="mr-2 inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400 align-middle shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                      )}
                      {row.feature}
                    </td>
                    <td className="px-3 py-3.5 text-center"><MarkCell value={row.invent} strong /></td>
                    <td className="px-3 py-3.5 text-center"><MarkCell value={row.kommo} /></td>
                    <td className="px-3 py-3.5 text-center"><MarkCell value={row.keybe} /></td>
                    <td className="px-3 py-3.5 text-center"><MarkCell value={row.b2chat} /></td>
                    <td className="px-3 py-3.5 text-center"><MarkCell value={row.wati} /></td>
                  </tr>
                ))}
                <tr>
                  <td className="px-5 py-4 text-xs text-zinc-500">Modelo de precio</td>
                  <td className="px-3 py-4 text-center text-xs font-medium text-cyan-300">Pago único + mensualidad fija</td>
                  <td className="px-3 py-4 text-center text-xs text-zinc-500">US$15–45/u/mes</td>
                  <td className="px-3 py-4 text-center text-xs text-zinc-500">~US$29–299/mes</td>
                  <td className="px-3 py-4 text-center text-xs text-zinc-500">US$14–99+/mes</td>
                  <td className="px-3 py-4 text-center text-xs text-zinc-500">US$39–229 + 20%/msg</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-6 text-center text-xs text-zinc-600">
            Datos de competencia tomados de fuentes públicas de cada producto.<sup className="text-cyan-400">5</sup>
          </p>
        </div>
      </section>

      {/* ─────────── NIVELES ─────────── */}
      <section id="niveles" className="mx-auto max-w-6xl px-6 py-24">
        <SectionHeader
          eyebrow="Niveles y precios"
          title="Elige el alcance según tu operación"
          subtitle="El precio es de implementación única (no por usuario, no por mes) más una mensualidad fija que cubre hosting, soporte e IA."
        />
        <div className="mt-14 grid items-stretch gap-5 lg:grid-cols-3">
          {TIERS.map((t) => (
            <div
              key={t.id}
              className={`relative flex flex-col rounded-2xl border p-7 ${
                t.featured
                  ? 'border-cyan-400/40 bg-gradient-to-b from-cyan-400/[0.08] to-zinc-900/40 shadow-[0_0_40px_-12px_rgba(34,211,238,0.5)]'
                  : 'border-zinc-800 bg-zinc-900/40'
              }`}
            >
              {t.featured && (
                <span className="absolute -top-3 left-7 inline-flex items-center gap-1.5 rounded-full bg-cyan-400 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-950">
                  Recomendado
                </span>
              )}
              <div>
                <h3 className="text-2xl font-bold tracking-tight text-white">{t.name}</h3>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-white">{t.priceUSD}</span>
                </div>
                <p className="mt-1 font-mono text-xs text-zinc-500">{t.priceCOP}</p>
                <p className="mt-5 text-sm text-zinc-400">{t.blurb}</p>
              </div>
              <ul className="mt-7 flex-1 space-y-3">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-zinc-200">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-7 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-xs">
                <p className="font-mono uppercase tracking-wider text-zinc-500">Mensualidad</p>
                <p className="mt-1 text-zinc-100">{t.monthly}</p>
              </div>
              <a
                href="#contacto"
                className={`mt-5 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition ${
                  t.featured
                    ? 'bg-cyan-400 text-cyan-950 hover:bg-cyan-300'
                    : 'border border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800'
                }`}
              >
                Empezar con {t.name} <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          ))}
        </div>
        <p className="mt-10 text-center text-sm text-zinc-500">
          El precio final dentro de cada nivel se ajusta según número de verticales/marcas, profundidad de migración
          de datos y horas de capacitación.
        </p>
      </section>

      {/* ─────────── MATRIZ ─────────── */}
      <section className="border-y border-zinc-900 bg-zinc-950/50">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <SectionHeader
            eyebrow="Matriz comparativa"
            title="Todo lo que incluye cada nivel"
          />
          <div className="mt-12 overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                  <th className="px-5 py-4 font-medium">Función</th>
                  <th className="px-3 py-4 text-center font-medium">Núcleo</th>
                  <th className="px-3 py-4 text-center font-semibold text-cyan-300">Pro</th>
                  <th className="px-3 py-4 text-center font-medium">Full</th>
                </tr>
              </thead>
              <tbody>
                {FEATURE_MATRIX.map((row, idx) => (
                  <tr
                    key={row.feature}
                    className={`border-b border-zinc-900/60 last:border-0 ${
                      idx < 2 ? 'bg-zinc-900/40 font-medium' : ''
                    }`}
                  >
                    <td className="px-5 py-3 text-zinc-300">{row.feature}</td>
                    <td className="px-3 py-3 text-center"><MarkCell value={row.nucleo} /></td>
                    <td className="px-3 py-3 text-center"><MarkCell value={row.pro} strong /></td>
                    <td className="px-3 py-3 text-center"><MarkCell value={row.full} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ─────────── PLAN DE IMPLEMENTACIÓN ─────────── */}
      <section id="plan" className="mx-auto max-w-6xl px-6 py-24">
        <SectionHeader
          eyebrow="Plan de implementación"
          title="Entre 1 y 4 semanas estás en producción"
          subtitle="Sujeto a disponibilidad de credenciales y a los tiempos de aprobación de Meta para el número de WhatsApp y plantillas (típicamente 1 a 5 días)."
        />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {TIMELINE.map((t) => (
            <div
              key={t.level}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 transition hover:border-zinc-700"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">{t.level}</h3>
                <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-0.5 text-xs font-mono text-cyan-300">
                  {t.weeks}
                </span>
              </div>
              <ol className="mt-5 space-y-3">
                {t.milestones.map((m, i) => (
                  <li key={m} className="flex items-start gap-3 text-sm text-zinc-300">
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-950 text-[10px] font-mono text-zinc-400">
                      {i + 1}
                    </span>
                    <span>{m}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>

        {/* lo que necesitamos de ti */}
        <div className="mt-14 grid gap-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8 lg:grid-cols-2">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-cyan-400">Lo que necesitamos de ti</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Para arrancar sin demoras</h3>
          </div>
          <ul className="space-y-3 text-sm text-zinc-300">
            {[
              { icon: Phone, text: 'Una línea celular dedicada para WhatsApp Business (no activa en la app personal).' },
              { icon: Globe, text: 'Acceso admin para verificar el negocio en Meta Business.' },
              { icon: Sparkles, text: 'Logo, paleta, fuentes y datos de la empresa para personalización.' },
              { icon: Workflow, text: 'Base de contactos a migrar (CSV) con autorización de tratamiento.' },
              { icon: Check, text: 'Un responsable interno como contraparte del proyecto.' },
              { icon: ScanFace, text: 'Para login facial: cada usuario da consentimiento expreso y enrola su rostro (opcional, siempre puede usar clave).' },
            ].map((r) => (
              <li key={r.text} className="flex items-start gap-3">
                <r.icon className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                <span>{r.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ─────────── PAGO + GARANTÍA + WHATSAPP COST ─────────── */}
      <section className="border-y border-zinc-900 bg-zinc-950/50">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-5 md:grid-cols-3">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-7">
              <CreditCard className="h-6 w-6 text-cyan-400" />
              <h3 className="mt-4 text-lg font-semibold text-white">Forma de pago</h3>
              <ul className="mt-4 space-y-2.5 text-sm text-zinc-300">
                <li>50% de anticipo a la firma del contrato</li>
                <li>50% contra entrega, validación y aprobación</li>
                <li>Mensualidad desde el go-live (mensual o anual con 10% off)</li>
                <li>COP (Wompi: PSE, transferencia, tarjeta) o USD (Stripe / transferencia)</li>
                <li>Facturación electrónica DIAN al día</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-7">
              <MessageCircle className="h-6 w-6 text-cyan-400" />
              <h3 className="mt-4 text-lg font-semibold text-white">Mensajes de WhatsApp</h3>
              <p className="mt-4 text-sm text-zinc-400">
                Tras el cambio de Meta de julio 2025, los mensajes se cobran <span className="text-zinc-200">por mensaje entregado</span> según categoría y país.<sup className="text-cyan-400">6</sup>
              </p>
              <ul className="mt-4 space-y-2.5 text-sm text-zinc-300">
                <li className="flex items-baseline justify-between gap-3"><span>Servicio (respuesta dentro de 24h)</span><span className="font-mono text-emerald-300">Gratis</span></li>
                <li className="flex items-baseline justify-between gap-3"><span>Marketing (a Colombia)</span><span className="font-mono text-zinc-100">~US$0.014</span></li>
                <li className="flex items-baseline justify-between gap-3"><span>Utility / Authentication</span><span className="font-mono text-zinc-100">~US$0.0008</span></li>
              </ul>
              <p className="mt-4 text-xs text-zinc-500">Meta los cobra directo (passthrough). Opcional: bolsa mensual estimada.</p>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-7">
              <ShieldCheck className="h-6 w-6 text-cyan-400" />
              <h3 className="mt-4 text-lg font-semibold text-white">Garantía y SLA</h3>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 text-left text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                      <th className="py-2 font-medium">Rubro</th>
                      <th className="py-2 text-center font-medium">N</th>
                      <th className="py-2 text-center font-medium">Pro</th>
                      <th className="py-2 text-center font-medium">Full</th>
                    </tr>
                  </thead>
                  <tbody className="text-zinc-300">
                    {SLA.map((row) => (
                      <tr key={row.rubro} className="border-b border-zinc-900/60 last:border-0">
                        <td className="py-2 text-zinc-400">{row.rubro}</td>
                        <td className="py-2 text-center">{row.nucleo}</td>
                        <td className="py-2 text-center">{row.pro}</td>
                        <td className="py-2 text-center text-cyan-300">{row.full}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── STACK ─────────── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <SectionHeader
          eyebrow="Stack"
          title="Tecnologías de primer nivel con SLA empresarial"
          subtitle="Una sola base de datos donde cada cliente vive aislado por tenant con Row Level Security. No es promesa de marketing — es propiedad del motor de base de datos."
        />
        <div className="mt-12 overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                <th className="px-5 py-4 font-medium">Capa</th>
                <th className="px-5 py-4 font-medium">Tecnología</th>
                <th className="px-5 py-4 font-medium">Por qué</th>
              </tr>
            </thead>
            <tbody>
              {STACK.map((r) => (
                <tr key={r.capa} className="border-b border-zinc-900/60 last:border-0">
                  <td className="px-5 py-3.5 font-medium text-zinc-200">{r.capa}</td>
                  <td className="px-5 py-3.5 text-zinc-300">{r.tech}</td>
                  <td className="px-5 py-3.5 text-zinc-400">{r.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ─────────── HABEAS DATA ─────────── */}
      <section className="border-y border-zinc-900 bg-zinc-950/50">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <SectionHeader
            eyebrow="Habeas Data"
            title="Qué guardamos, qué no, cómo se borra"
          />
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-7">
              <h3 className="text-lg font-semibold text-white">Del WhatsApp</h3>
              <p className="mt-3 text-sm text-zinc-400">
                Guardamos mensajes, adjuntos y metadatos del histórico bajo consentimiento del titular (capturado al inicio del chat).
                La retención es configurable por tenant. El titular puede solicitar borrado en cualquier momento.
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-7">
              <h3 className="text-lg font-semibold text-white">Del rostro</h3>
              <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" /> <span><span className="font-medium text-rose-200">NO</span> guardamos la foto del usuario.</span></li>
                <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" /> <span>Sí guardamos un vector matemático de 512 dimensiones (embedding). Es irreversible.</span></li>
                <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" /> <span>Solo con consentimiento expreso previo registrado (consent_id, IP, timestamp, política aceptada).</span></li>
                <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" /> <span>Borrado por el usuario en cualquier momento, con proof_hash auditable.</span></li>
                <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" /> <span>El embedding no se comparte con terceros ni se usa para nada distinto al login.</span></li>
              </ul>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-7">
              <h3 className="text-lg font-semibold text-white">Aislamiento entre clientes</h3>
              <p className="mt-3 text-sm text-zinc-400">
                Cada implementación tiene su <span className="font-mono text-cyan-300">tenant_id</span>. Postgres aplica
                Row Level Security a cada consulta — aunque alguien obtuviera credenciales de un usuario, no podría ver datos
                de otro tenant.
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-7">
              <h3 className="text-lg font-semibold text-white">Cifrado y cumplimiento Ley 1581</h3>
              <p className="mt-3 text-sm text-zinc-400">
                Todo viaja sobre HTTPS/TLS 1.3. Datos en reposo cifrados a nivel de disco. Consentimiento informado, explícito
                y separado para almacenamiento, WhatsApp, IA y biometría. Trazabilidad auditable, roles y panel SIC en Full.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── CONTACTO / CTA ─────────── */}
      <section id="contacto" className="mx-auto max-w-6xl px-6 py-24">
        <div className="relative overflow-hidden rounded-3xl border border-cyan-400/30 bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 p-12 text-center">
          <div className="pointer-events-none absolute -top-32 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-cyan-400/20 blur-[100px]" />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Reserva tu demo de 30 minutos.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-zinc-400">
              Te muestro el CRM funcionando con WhatsApp real, IA real y login facial real — sobre datos de prueba.
              Después confirmas el nivel y arrancamos esa misma semana con un anticipo del 50%.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <a
                href="mailto:inventagency20@gmail.com"
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-6 py-3 text-sm font-semibold text-cyan-950 shadow-[0_0_30px_rgba(34,211,238,0.35)] transition hover:bg-cyan-300"
              >
                <Mail className="h-4 w-4" />
                inventagency20@gmail.com
              </a>
              <a
                href="https://wa.me/573027002000"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-zinc-800"
              >
                <MessageCircle className="h-4 w-4 text-emerald-400" />
                Escribir por WhatsApp
              </a>
            </div>
            <p className="mt-6 text-xs text-zinc-500">
              Invent Agency · Bogotá, Colombia · Oferta válida 30 días calendario.
            </p>
          </div>
        </div>
      </section>

      {/* ─────────── FOOTER + FUENTES ─────────── */}
      <footer className="border-t border-zinc-900 bg-zinc-950">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <details className="group rounded-2xl border border-zinc-800/70 bg-zinc-900/40 px-5 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-zinc-300">
              <span className="inline-flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-cyan-400" />
                Fuentes y referencias
              </span>
              <ChevronDown className="h-4 w-4 text-zinc-500 transition group-open:rotate-180" />
            </summary>
            <ol className="mt-5 space-y-2 text-xs text-zinc-400">
              {FOOTNOTES.map((f) => (
                <li key={f.n} className="flex gap-3">
                  <span className="font-mono text-cyan-400">[{f.n}]</span>
                  <span>{f.text}</span>
                </li>
              ))}
            </ol>
          </details>
          <div className="mt-8 flex flex-col items-start justify-between gap-3 text-xs text-zinc-500 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400" />
              CRM Invent · Invent Agency · 2026
            </div>
            <div className="flex items-center gap-4">
              <Link href="/login" className="transition hover:text-zinc-300">Acceder al CRM</Link>
              <span>·</span>
              <a href="mailto:inventagency20@gmail.com" className="transition hover:text-zinc-300">inventagency20@gmail.com</a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  )
}
