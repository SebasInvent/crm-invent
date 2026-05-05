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

export function CommandPalette() {
  const [open, setOpen] = useState(false)
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

      {/* Palette */}
      <Command
        label="Command palette"
        className="relative w-full max-w-xl bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-center gap-3 border-b border-zinc-800 px-4">
          <Search className="h-4 w-4 text-zinc-500 shrink-0" />
          <Command.Input
            autoFocus
            placeholder="Buscar páginas, acciones, contactos..."
            className="flex-1 bg-transparent border-0 outline-none text-white placeholder:text-zinc-600 py-4 text-sm"
          />
          <kbd className="hidden sm:inline-flex items-center text-[10px] font-mono uppercase tracking-wider text-zinc-600 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5">
            ESC
          </kbd>
        </div>

        <Command.List className="max-h-[400px] overflow-y-auto p-2">
          <Command.Empty className="py-12 text-center text-sm text-zinc-500">
            Sin resultados.
          </Command.Empty>

          <Command.Group heading="Páginas" className="text-[10px] uppercase tracking-wider text-zinc-600 px-2 pt-2 pb-1">
            {NAV_ITEMS.map((item) => (
              <Command.Item
                key={item.href}
                value={`${item.label} ${(item.keywords ?? []).join(' ')}`}
                onSelect={() => go(item.href)}
                className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-900 hover:text-white aria-selected:bg-zinc-900 aria-selected:text-white cursor-pointer"
              >
                <item.icon className="h-4 w-4 text-zinc-500 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                <Hash className="h-3 w-3 text-zinc-700" />
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading="Acciones rápidas" className="text-[10px] uppercase tracking-wider text-zinc-600 px-2 pt-3 pb-1">
            {QUICK_ACTIONS.map((action) => (
              <Command.Item
                key={action.label}
                value={`${action.label} ${(action.keywords ?? []).join(' ')}`}
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
