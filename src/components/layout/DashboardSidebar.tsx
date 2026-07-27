'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { getAuthClient } from '@/lib/supabase-auth'
import {
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
  LogOut,
  MessageCircle,
  Megaphone,
  Menu,
  Target,
  CalendarCheck,
  Globe2,
  X,
} from 'lucide-react'
import { OrgSwitcher } from '@/components/orgs/OrgSwitcher'
import { useOrg } from '@/components/orgs/OrgProvider'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Operación Global', href: '/dashboard/yumk', icon: Globe2 },
  { name: 'Conversaciones', href: '/dashboard/conversaciones', icon: MessageCircle },
  { name: 'Contactos 360°', href: '/dashboard/contacts', icon: Contact2 },
  { name: 'Leads', href: '/dashboard/leads', icon: Target },
  { name: 'Pipeline', href: '/dashboard/pipeline', icon: BarChart3 },
  { name: 'Inbox', href: '/dashboard/inbox', icon: Inbox },
  { name: 'Proyectos', href: '/dashboard/projects', icon: FolderKanban },
  { name: 'Cotizaciones', href: '/dashboard/quotes', icon: FileText },
  { name: 'Facturación', href: '/dashboard/invoices', icon: DollarSign },
  { name: 'Documentos', href: '/dashboard/documents', icon: Folder },
  { name: 'Analytics', href: '/dashboard/analytics', icon: LineChart },
  { name: 'Integraciones', href: '/dashboard/integrations', icon: Puzzle },
  { name: 'Agentes', href: '/dashboard/agents', icon: Users },
  { name: 'Entregables', href: '/dashboard/deliverables', icon: Package },
  { name: 'Calendario', href: '/dashboard/calendar', icon: Calendar },
  { name: 'Estrategia', href: '/dashboard/estrategia', icon: Megaphone },
  { name: 'Publicaciones', href: '/dashboard/publicaciones', icon: CalendarCheck },
  { name: 'Emails', href: '/dashboard/emails', icon: Mail },
  { name: 'Configuración', href: '/dashboard/settings', icon: Settings },
]

export function DashboardSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { activeOrg } = useOrg()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close drawer on route change (so clicking a nav link in mobile dismisses)
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // Lock body scroll while drawer is open (mobile)
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  // Close on ESC
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  async function handleLogout() {
    window.sessionStorage.removeItem('control:workspace-override')
    const supabase = getAuthClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      {/* Mobile burger button — fixed top-left, only visible <md */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-3 left-3 z-40 inline-flex items-center justify-center h-11 w-11 rounded-lg bg-zinc-950/90 backdrop-blur border border-zinc-800 text-white hover:bg-zinc-900 transition-colors"
        aria-label="Abrir menú"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 z-40 animate-in fade-in duration-200"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar — persistent on md+, slide-in drawer on mobile */}
      <aside
        className={cn(
          'border-r border-zinc-800 bg-black flex flex-col',
          // Desktop: persistent left column inside flex
          'md:relative md:w-64 md:flex-shrink-0',
          // Mobile: fixed full-height drawer that slides
          'fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw]',
          'transition-transform duration-300 ease-in-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        {/* Header with logo + close button (mobile) */}
        <div className="flex h-16 items-center justify-between px-6 border-b border-zinc-800 flex-shrink-0">
          <div>
            <p className="text-sm font-black tracking-[0.18em] text-white">CONTROL</p>
            <p className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-zinc-600">
              {activeOrg?.slug === 'yumk' ? 'Yumk Group' : 'Invent Agency'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="md:hidden inline-flex items-center justify-center h-9 w-9 rounded-lg text-zinc-400 hover:bg-zinc-900 hover:text-white"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <OrgSwitcher />

        {/* Search hint — Cmd+K opens the global command palette */}
        <button
          type="button"
          onClick={() => {
            // Trigger Cmd+K event so the palette opens. Cleaner than
            // exposing a context — the palette listens for the keydown.
            window.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'k', metaKey: true }),
            )
          }}
          className="hidden md:flex items-center justify-between mx-3 mt-3 mb-1 px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900 hover:border-zinc-700 transition-colors text-xs text-zinc-500 hover:text-zinc-300"
        >
          <span className="flex items-center gap-2">
            <span>Buscar...</span>
          </span>
          <kbd className="inline-flex items-center font-mono text-[10px] uppercase tracking-wider bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5">
            ⌘ K
          </kbd>
        </button>

        <nav className="flex-1 space-y-1 p-4 overflow-y-auto">
          {navigation.map((item) => {
            // '/dashboard' (Dashboard) NO debe usar prefijo, porque
            // startsWith('/dashboard/') matchea TODAS las subrutas y dejaba el
            // highlight pegado. Solo exacto para el root; prefijo para el resto.
            const isActive =
              item.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname === item.href || pathname?.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'group flex items-center gap-3 rounded-lg px-3 py-3 md:py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-white text-black'
                    : 'text-zinc-400 hover:bg-zinc-900 hover:text-white',
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                <span className="truncate">{item.name}</span>
              </Link>
            )
          })}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-zinc-800 flex-shrink-0">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-900 hover:text-red-400 transition-colors"
          >
            <LogOut className="h-5 w-5" />
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  )
}
