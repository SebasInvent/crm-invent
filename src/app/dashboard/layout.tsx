'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { getAuthClient } from '@/lib/supabase-auth'
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  Package,
  Receipt,
  Calendar,
  Settings,
  Mail,
  Contact2,
  BarChart3,
  Target,
  Inbox,
  FileText,
  DollarSign,
  Folder,
  LineChart,
  Puzzle,
  LogOut,
  MessageCircle
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Conversaciones', href: '/dashboard/conversaciones', icon: MessageCircle },
  { name: 'Contactos 360°', href: '/dashboard/contacts', icon: Contact2 },
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
  { name: 'Emails', href: '/dashboard/emails', icon: Mail },
  { name: 'Configuración', href: '/dashboard/settings', icon: Settings },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = getAuthClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="flex h-screen bg-black">
      {/* Sidebar */}
      <div className="w-64 border-r border-zinc-800 bg-black flex flex-col">
        <div className="flex h-16 items-center px-6 border-b border-zinc-800 flex-shrink-0">
          <img
            src="https://www.inventagency.co/logo-white.png"
            alt="Invent"
            className="h-8 w-auto"
          />
        </div>
        <nav className="flex-1 space-y-1 p-4 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-white text-black'
                    : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            )
          })}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-zinc-800 flex-shrink-0">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-900 hover:text-red-400 transition-colors"
          >
            <LogOut className="h-5 w-5" />
            Cerrar sesión
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-auto p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
