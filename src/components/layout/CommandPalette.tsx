'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'
import {
  Search,
  LayoutDashboard,
  Users,
  FolderKanban,
  Package,
  Calendar,
  Settings,
  Mail,
  Contact2,
  BarChart3,
  Inbox,
  FileText,
  DollarSign,
  Folder,
  LineChart,
  Puzzle,
  MessageCircle,
  Plus,
  Target,
  Sparkles,
  Hash,
  Loader2,
  TrendingUp,
} from 'lucide-react'

interface NavItem {
  label: string
  href: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any
  keywords?: string[]
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, keywords: ['home', 'inicio'] },
  { label: 'Conversaciones', href: '/dashboard/conversaciones', icon: MessageCircle, keywords: ['chat', 'messages', 'whatsapp'] },
  { label: 'Contactos 360°', href: '/dashboard/contacts', icon: Contact2, keywords: ['gente', 'people'] },
  { label: 'Leads', href: '/dashboard/leads', icon: Target, keywords: ['prospectos', 'jung'] },
  { label: 'Pipeline', href: '/dashboard/pipeline', icon: BarChart3, keywords: ['kanban', 'deals', 'oportunidades'] },
  { label: 'Inbox', href: '/dashboard/inbox', icon: Inbox, keywords: ['email', 'unified'] },
  { label: 'Proyectos', href: '/dashboard/projects', icon: FolderKanban },
  { label: 'Cotizaciones', href: '/dashboard/quotes', icon: FileText, keywords: ['quote', 'propuesta'] },
  { label: 'Facturación', href: '/dashboard/invoices', icon: DollarSign, keywords: ['invoices', 'billing'] },
  { label: 'Documentos', href: '/dashboard/documents', icon: Folder, keywords: ['files', 'archivos'] },
  { label: 'Analytics', href: '/dashboard/analytics', icon: LineChart, keywords: ['metricas', 'reports'] },
  { label: 'Integraciones', href: '/dashboard/integrations', icon: Puzzle, keywords: ['api', 'webhooks'] },
  { label: 'Agentes', href: '/dashboard/agents', icon: Users },
  { label: 'Entregables', href: '/dashboard/deliverables', icon: Package },
  { label: 'Calendario', href: '/dashboard/calendar', icon: Calendar },
  { label: 'Emails', href: '/dashboard/emails', icon: Mail },
  { label: 'Configuración', href: '/dashboard/settings', icon: Settings, keywords: ['settings', 'ajustes'] },
]

interface QuickAction {
  label: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any
  shortcut?: string
  keywords?: string[]
  run: (router: ReturnType<typeof useRouter>) => void
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Nuevo contacto',
    icon: Plus,
    keywords: ['create', 'add', 'crear contacto'],
    run: (router) => router.push('/dashboard/contacts?new=1'),
  },
  {
    label: 'Nuevo lead',
    icon: Plus,
    keywords: ['create lead', 'prospecto nuevo'],
    run: (router) => router.push('/dashboard/leads/new'),
  },
  {
    label: 'Nueva cotización',
    icon: Plus,
    keywords: ['quote', 'propuesta'],
    run: (router) => router.push('/dashboard/quotes?new=1'),
  },
  {
    label: 'Buscar lead',
    icon: Search,
    keywords: ['search', 'find'],
    run: (router) => router.push('/dashboard/leads'),
  },
]

type SearchHit = {
  id: string
  entity: 'contact' | 'lead' | 'deal'
  title: string
  subtitle?: string
  href: string
  meta?: Record<string, unknown>
}

const ENTITY_LABELS: Record<SearchHit['entity'], string> = {
  contact: 'Contacto',
  lead: 'Lead',
  deal: 'Deal',
}
const ENTITY_ICONS: Record<SearchHit['entity'], typeof Contact2> = {
  contact: Contact2,
  lead: Target,
  deal: TrendingUp,
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const router = useRouter()

  // Cmd+K / Ctrl+K toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
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

  // Reset query state when palette closes so reopening starts fresh
  useEffect(() => {
    if (!open) {
      setQuery('')
      setHits([])
      setSearching(false)
    }
  }, [open])

  // Debounced global search — fires only after the user pauses typing
  // for 200ms and the term is at least 2 chars. Aborts in-flight on
  // every keystroke so we don't paint stale results.
  useEffect(() => {
    if (!open) return
    const term = query.trim()
    if (term.length < 2) {
      setHits([])
      setSearching(false)
      return
    }
    const ctl = new AbortController()
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/global?q=${encodeURIComponent(term)}&limit=8`, {
          signal: ctl.signal,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as { hits: SearchHit[] }
        setHits(data.hits || [])
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        setHits([])
      } finally {
        setSearching(false)
      }
    }, 200)
    return () => {
      ctl.abort()
      clearTimeout(timer)
    }
  }, [query, open])

  const go = useCallback(
    (href: string) => {
      router.push(href)
      setOpen(false)
    },
    [router],
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] sm:pt-[15vh] px-4"
      onClick={(e) => {
        // close on backdrop click
        if (e.target === e.currentTarget) setOpen(false)
      }}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-100"
        onClick={() => setOpen(false)}
        aria-hidden
      />

      {/* Palette
          shouldFilter={false} disables cmdk's built-in fuzzy filter so
          our async search results render as-is without being filtered
          again on the client. cmdk still handles keyboard nav over the
          rendered items. */}
      <Command
        shouldFilter={false}
        label="Command palette"
        className="relative w-full max-w-xl bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-center gap-3 border-b border-zinc-800 px-4">
          <Search className="h-4 w-4 text-zinc-500 shrink-0" />
          <Command.Input
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Buscar páginas, contactos, leads, deals..."
            className="flex-1 bg-transparent border-0 outline-none text-white placeholder:text-zinc-600 py-4 text-sm"
          />
          {searching && <Loader2 className="h-3.5 w-3.5 text-zinc-500 animate-spin" />}
          <kbd className="hidden sm:inline-flex items-center text-[10px] font-mono uppercase tracking-wider text-zinc-600 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5">
            ESC
          </kbd>
        </div>

        <Command.List className="max-h-[420px] overflow-y-auto p-2">
          <Command.Empty className="py-12 text-center text-sm text-zinc-500">
            {query.trim().length < 2 ? 'Empieza a escribir...' : 'Sin resultados.'}
          </Command.Empty>

          {/* Live entity search results (only visible when query >= 2 chars) */}
          {hits.length > 0 && (
            <Command.Group
              heading="Resultados"
              className="text-[10px] uppercase tracking-wider text-zinc-600 px-2 pt-2 pb-1"
            >
              {hits.map((hit) => {
                const Icon = ENTITY_ICONS[hit.entity]
                return (
                  <Command.Item
                    key={`${hit.entity}-${hit.id}`}
                    value={`${hit.entity}-${hit.id}-${hit.title}`}
                    onSelect={() => go(hit.href)}
                    className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-900 hover:text-white aria-selected:bg-zinc-900 aria-selected:text-white cursor-pointer"
                  >
                    <Icon className="h-4 w-4 text-zinc-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-white truncate">{hit.title}</div>
                      {hit.subtitle && (
                        <div className="text-xs text-zinc-500 truncate">{hit.subtitle}</div>
                      )}
                    </div>
                    <span className="text-[10px] uppercase tracking-wider text-zinc-600 flex-shrink-0">
                      {ENTITY_LABELS[hit.entity]}
                    </span>
                  </Command.Item>
                )
              })}
            </Command.Group>
          )}

          {/* Static page list — filtered client-side against the query
              since shouldFilter is disabled. Empty query shows everything. */}
          {(() => {
            const term = query.trim().toLowerCase()
            const filteredNav = NAV_ITEMS.filter((item) => {
              if (!term) return true
              const hay = `${item.label} ${(item.keywords ?? []).join(' ')}`.toLowerCase()
              return hay.includes(term)
            })
            return filteredNav.length === 0 ? null : (
              <Command.Group
                heading="Páginas"
                className="text-[10px] uppercase tracking-wider text-zinc-600 px-2 pt-2 pb-1"
              >
                {filteredNav.map((item) => (
                  <Command.Item
                    key={item.href}
                    value={`page-${item.href}`}
                    onSelect={() => go(item.href)}
                    className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-900 hover:text-white aria-selected:bg-zinc-900 aria-selected:text-white cursor-pointer"
                  >
                    <item.icon className="h-4 w-4 text-zinc-500 shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    <Hash className="h-3 w-3 text-zinc-700" />
                  </Command.Item>
                ))}
              </Command.Group>
            )
          })()}

          {(() => {
            const term = query.trim().toLowerCase()
            const filteredActions = QUICK_ACTIONS.filter((a) => {
              if (!term) return true
              const hay = `${a.label} ${(a.keywords ?? []).join(' ')}`.toLowerCase()
              return hay.includes(term)
            })
            return filteredActions.length === 0 ? null : (
              <Command.Group
                heading="Acciones rápidas"
                className="text-[10px] uppercase tracking-wider text-zinc-600 px-2 pt-3 pb-1"
              >
                {filteredActions.map((action) => (
                  <Command.Item
                    key={action.label}
                    value={`action-${action.label}`}
                    onSelect={() => {
                      action.run(router)
                      setOpen(false)
                    }}
                    className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-900 hover:text-white aria-selected:bg-zinc-900 aria-selected:text-white cursor-pointer"
                  >
                    <action.icon className="h-4 w-4 text-zinc-500 shrink-0" />
                    <span className="flex-1 truncate">{action.label}</span>
                    <Sparkles className="h-3 w-3 text-zinc-700" />
                  </Command.Item>
                ))}
              </Command.Group>
            )
          })()}
        </Command.List>

        {/* Footer */}
        <div className="border-t border-zinc-800 px-4 py-2.5 flex items-center justify-between text-[11px] text-zinc-500">
          <span>
            Atajo:{' '}
            <kbd className="font-mono bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5">
              ⌘ K
            </kbd>
          </span>
          <span>
            Enter ↵ para abrir · Esc para cerrar
          </span>
        </div>
      </Command>
    </div>
  )
}
