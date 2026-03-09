'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  Package,
  Receipt,
  Calendar,
  Settings,
  Mail,
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Clientes', href: '/dashboard/clients', icon: Users },
  { name: 'Proyectos', href: '/dashboard/projects', icon: FolderKanban },
  { name: 'Entregables', href: '/dashboard/deliverables', icon: Package },
  { name: 'Facturas', href: '/dashboard/invoices', icon: Receipt },
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

  return (
    <div className="flex h-screen bg-black">
      {/* Sidebar */}
      <div className="w-64 border-r border-zinc-800 bg-black">
        <div className="flex h-16 items-center px-6 border-b border-zinc-800">
          <img
            src="https://www.inventagency.co/logo-white.png"
            alt="Invent"
            className="h-8 w-auto"
          />
        </div>
        <nav className="flex-1 space-y-1 p-4">
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
