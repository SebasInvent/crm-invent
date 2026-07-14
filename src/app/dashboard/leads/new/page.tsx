'use client'

/**
 * Alta manual de leads. El CTA "Nuevo Lead" apuntaba aquí desde siempre,
 * pero la ruta no existía (404). Postea a /api/leads (zod + requireAuth).
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, UserPlus } from 'lucide-react'

const SOURCES = ['web', 'referido', 'instagram', 'linkedin', 'whatsapp', 'evento', 'otro']

export default function NewLeadPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    industry: '',
    source: 'web',
    notes: '',
    priority: 'medium',
  })

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          company: form.company.trim() || null,
          industry: form.industry.trim() || null,
          source: form.source || null,
          notes: form.notes.trim() || null,
          priority: form.priority || null,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'No se pudo crear el lead')
      toast.success('Lead creado')
      router.push('/dashboard/leads')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error creando el lead')
    } finally {
      setSaving(false)
    }
  }

  const field = 'bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500'

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/leads">
          <Button variant="ghost" size="icon" className="text-zinc-400">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Nuevo Lead</h1>
          <p className="text-sm text-zinc-400">Alta manual — para captura automática usá el Scraper o la máquina n8n.</p>
        </div>
      </div>

      <Card className="bg-zinc-950 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <UserPlus className="h-5 w-5" /> Datos del lead
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="text-sm text-zinc-400 mb-1 block">Nombre *</label>
                <Input className={field} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Nombre y apellido" required />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Email</label>
                <Input className={field} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="correo@empresa.co" />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Teléfono</label>
                <Input className={field} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+57 300 000 0000" />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Empresa</label>
                <Input className={field} value={form.company} onChange={(e) => set('company', e.target.value)} placeholder="Nombre de la empresa" />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Industria</label>
                <Input className={field} value={form.industry} onChange={(e) => set('industry', e.target.value)} placeholder="p.ej. nightlife, retail" />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Fuente</label>
                <select
                  className="w-full h-10 rounded-md px-3 text-sm bg-zinc-900 border border-zinc-700 text-white"
                  value={form.source}
                  onChange={(e) => set('source', e.target.value)}
                >
                  {SOURCES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Prioridad</label>
                <select
                  className="w-full h-10 rounded-md px-3 text-sm bg-zinc-900 border border-zinc-700 text-white"
                  value={form.priority}
                  onChange={(e) => set('priority', e.target.value)}
                >
                  <option value="low">Baja</option>
                  <option value="medium">Media</option>
                  <option value="high">Alta</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-sm text-zinc-400 mb-1 block">Notas</label>
                <textarea
                  className="w-full rounded-md px-3 py-2 text-sm bg-zinc-900 border border-zinc-700 text-white placeholder:text-zinc-500 min-h-[90px]"
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  placeholder="Contexto, necesidad, cómo llegó…"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Link href="/dashboard/leads">
                <Button type="button" variant="outline" className="border-zinc-700 text-zinc-300">Cancelar</Button>
              </Link>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
                Crear lead
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
