'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getAuthClient } from '@/lib/supabase-auth'
import { toast } from 'sonner'
import { Mail, User, LogOut, Trash2, RefreshCw, Sparkles, Github } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface Props {
  email: string
  userId: string
  createdAt?: string | null
  lastSignInAt: string | null
  provider: string
}

const ARIA_STORAGE_KEY = 'aria-conversation-v1'

export function SettingsClient({ email, userId, createdAt, lastSignInAt, provider }: Props) {
  const router = useRouter()
  const qc = useQueryClient()
  const [signingOut, setSigningOut] = useState(false)

  function fmt(iso?: string | null) {
    if (!iso) return '—'
    try {
      return format(new Date(iso), "d 'de' MMMM yyyy, HH:mm", { locale: es })
    } catch {
      return iso
    }
  }

  async function handleSignOut() {
    setSigningOut(true)
    try {
      const supabase = getAuthClient()
      await supabase.auth.signOut()
      router.push('/login')
      router.refresh()
    } catch (err) {
      toast.error('No se pudo cerrar sesión', {
        description: err instanceof Error ? err.message : 'Intenta de nuevo.',
      })
      setSigningOut(false)
    }
  }

  function clearCache() {
    qc.clear()
    toast.success('Cache limpiada', {
      description: 'Se refrescarán los datos al volver a cada página.',
    })
  }

  function clearAriaConversation() {
    try {
      localStorage.removeItem(ARIA_STORAGE_KEY)
      toast.success('Historial de Aria borrado')
    } catch {
      toast.error('No se pudo borrar el historial')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Configuración</h1>
        <p className="text-zinc-400 mt-1">Tu cuenta y preferencias del CRM</p>
      </div>

      {/* Account info */}
      <Card className="bg-zinc-950 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base text-white flex items-center gap-2">
            <User className="h-4 w-4 text-zinc-400" />
            Cuenta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <Field icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={email} />
          <Field
            icon={<Github className="h-3.5 w-3.5" />}
            label="Método de acceso"
            value={provider}
          />
          <Field
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            label="Última sesión"
            value={fmt(lastSignInAt)}
          />
          <Field
            icon={<Sparkles className="h-3.5 w-3.5" />}
            label="Cuenta creada"
            value={fmt(createdAt)}
          />
          <Field icon={<User className="h-3.5 w-3.5" />} label="User ID" value={userId} mono />
        </CardContent>
      </Card>

      {/* Cache & data */}
      <Card className="bg-zinc-950 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base text-white flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-zinc-400" />
            Cache y datos locales
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ActionRow
            title="Limpiar cache de queries"
            description="Si los datos en pantalla no concuerdan con los reales, fuerza un refetch limpio."
            cta={
              <Button
                variant="outline"
                size="sm"
                onClick={clearCache}
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-900"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-2" />
                Limpiar cache
              </Button>
            }
          />
          <div className="border-t border-zinc-900" />
          <ActionRow
            title="Borrar historial de Aria"
            description="Resetea la conversación con Aria que vive en este navegador."
            cta={
              <Button
                variant="outline"
                size="sm"
                onClick={clearAriaConversation}
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-900"
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Borrar historial
              </Button>
            }
          />
        </CardContent>
      </Card>

      {/* Próximamente */}
      <Card className="bg-zinc-950 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base text-white flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-zinc-400" />
            Próximamente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-zinc-500">
            <li>• Cambio de contraseña y 2FA</li>
            <li>• Preferencias de notificaciones (email, push, WhatsApp)</li>
            <li>• Conexiones externas (Google Calendar, Drive, GitHub)</li>
            <li>• Roles y permisos por equipo</li>
            <li>• Branding personalizado del CRM</li>
          </ul>
        </CardContent>
      </Card>

      {/* Sign out — separate, dangerous */}
      <Card className="bg-zinc-950 border-red-500/30">
        <CardHeader>
          <CardTitle className="text-base text-red-400 flex items-center gap-2">
            <LogOut className="h-4 w-4" />
            Sesión
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={handleSignOut}
            disabled={signingOut}
            className="border-red-500/30 text-red-400 hover:bg-red-500/10"
          >
            <LogOut className="h-3.5 w-3.5 mr-2" />
            {signingOut ? 'Cerrando…' : 'Cerrar sesión'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function Field({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <span className="flex items-center gap-2 text-zinc-500 text-xs uppercase tracking-wider">
        {icon}
        {label}
      </span>
      <span className={`text-zinc-200 ${mono ? 'font-mono text-xs' : ''} truncate max-w-[60%]`}>
        {value}
      </span>
    </div>
  )
}

function ActionRow({
  title,
  description,
  cta,
}: {
  title: string
  description: string
  cta: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-white">{title}</div>
        <div className="text-xs text-zinc-500 mt-0.5">{description}</div>
      </div>
      {cta}
    </div>
  )
}
