'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeft, Send, Copy, Trash2, Printer, Loader2 } from 'lucide-react'
import type { Quote, QuoteLineItem } from '@/types/finance'

const COP = (n: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n || 0)

const statusLabels: Record<string, string> = {
  draft: 'Borrador',
  sent: 'Enviada',
  viewed: 'Vista',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  expired: 'Expirada',
  converted: 'Convertida',
  cancelled: 'Cancelada',
}

const statusBadge: Record<string, string> = {
  draft: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  sent: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  viewed: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  accepted: 'bg-green-500/20 text-green-400 border-green-500/30',
  rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
  expired: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  converted: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  cancelled: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
}

export default function QuoteDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [quote, setQuote] = useState<Quote | null>(null)
  const [items, setItems] = useState<QuoteLineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/quotes/${params.id}`)
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'No se encontró la cotización')
        return
      }
      setQuote(json.quote as Quote)
      setItems((json.items ?? []) as QuoteLineItem[])
    } catch {
      toast.error('Error de red al cargar la cotización')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    load()
  }, [load])

  async function send() {
    setBusy(true)
    try {
      const res = await fetch(`/api/quotes/${params.id}/send`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'No se pudo enviar')
        return
      }
      toast.success(`Enviada a ${json.sent_to}`)
      load()
    } finally {
      setBusy(false)
    }
  }

  async function duplicate() {
    setBusy(true)
    try {
      const res = await fetch(`/api/quotes/${params.id}/duplicate`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'No se pudo duplicar')
        return
      }
      toast.success('Cotización duplicada')
      router.push(`/dashboard/quotes/${json.quote.id}`)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm('¿Eliminar esta cotización? Esta acción no se puede deshacer.')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/quotes/${params.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'No se pudo eliminar')
        return
      }
      toast.success('Cotización eliminada')
      router.push('/dashboard/quotes')
    } finally {
      setBusy(false)
    }
  }

  async function setStatus(status: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/quotes/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'No se pudo actualizar')
        return
      }
      toast.success('Estado actualizado')
      load()
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-zinc-500">Cargando...</div>
  }
  if (!quote) {
    return (
      <div className="p-8 text-center text-zinc-500">
        Cotización no encontrada.
        <div className="mt-4">
          <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={() => router.push('/dashboard/quotes')}>
            Volver
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Toolbar — se oculta al imprimir */}
      <div className="flex items-center justify-between print:hidden">
        <Button
          variant="ghost"
          className="text-zinc-400 hover:text-white"
          onClick={() => router.push('/dashboard/quotes')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Cotizaciones
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" />
            PDF / Imprimir
          </Button>
          <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={send} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Enviar
          </Button>
          <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={duplicate} disabled={busy}>
            <Copy className="h-4 w-4 mr-2" />
            Duplicar
          </Button>
          <Button variant="outline" className="border-red-900 text-red-400 hover:bg-red-950" onClick={remove} disabled={busy}>
            <Trash2 className="h-4 w-4 mr-2" />
            Eliminar
          </Button>
        </div>
      </div>

      {/* Cambios de estado rápidos */}
      <div className="flex flex-wrap gap-2 print:hidden">
        {['sent', 'accepted', 'rejected', 'converted'].map((s) => (
          <Button
            key={s}
            size="sm"
            variant="outline"
            className="border-zinc-800 text-zinc-400 text-xs"
            onClick={() => setStatus(s)}
            disabled={busy || quote.status === s}
          >
            Marcar {statusLabels[s]}
          </Button>
        ))}
      </div>

      {/* Documento */}
      <Card className="bg-zinc-950 border-zinc-800 print:bg-white print:text-black">
        <CardContent className="p-8 space-y-8">
          {/* Encabezado */}
          <div className="flex items-start justify-between">
            <div>
              <img
                src="https://www.inventagency.co/logo-white.png"
                alt="Invent Agency"
                className="h-8 w-auto mb-3 print:hidden"
              />
              <h1 className="text-2xl font-bold text-white print:text-black">
                Cotización {quote.quote_number}
              </h1>
              <p className="text-zinc-400 print:text-zinc-600 mt-1">
                {quote.created_at
                  ? format(new Date(quote.created_at), "dd 'de' MMMM yyyy", { locale: es })
                  : ''}
              </p>
            </div>
            <Badge variant="outline" className={statusBadge[quote.status] || statusBadge.draft}>
              {statusLabels[quote.status] || quote.status}
            </Badge>
          </div>

          {/* Cliente */}
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Cliente</div>
              <div className="text-white print:text-black font-medium">{quote.client_name || '—'}</div>
              {quote.client_company && (
                <div className="text-zinc-400 print:text-zinc-600 text-sm">{quote.client_company}</div>
              )}
              {quote.client_email && (
                <div className="text-zinc-400 print:text-zinc-600 text-sm">{quote.client_email}</div>
              )}
            </div>
            <div className="md:text-right">
              <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Válida hasta</div>
              <div className="text-white print:text-black">
                {quote.valid_until
                  ? format(new Date(quote.valid_until), 'dd MMM yyyy', { locale: es })
                  : 'Sin fecha'}
              </div>
            </div>
          </div>

          {/* Líneas */}
          <div className="border border-zinc-800 print:border-zinc-300 rounded-lg overflow-x-auto">
            <table className="w-full">
              <thead className="bg-zinc-900 print:bg-zinc-100">
                <tr>
                  <th className="text-left p-3 text-zinc-400 print:text-zinc-600 text-sm">Descripción</th>
                  <th className="text-center p-3 text-zinc-400 print:text-zinc-600 text-sm">Cant.</th>
                  <th className="text-right p-3 text-zinc-400 print:text-zinc-600 text-sm">Precio</th>
                  <th className="text-right p-3 text-zinc-400 print:text-zinc-600 text-sm">Desc %</th>
                  <th className="text-right p-3 text-zinc-400 print:text-zinc-600 text-sm">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800 print:divide-zinc-300">
                {items.map((it) => (
                  <tr key={it.id}>
                    <td className="p-3 text-white print:text-black">{it.description || '—'}</td>
                    <td className="p-3 text-center text-zinc-300 print:text-zinc-700">{it.quantity}</td>
                    <td className="p-3 text-right text-zinc-300 print:text-zinc-700">{COP(it.unit_price)}</td>
                    <td className="p-3 text-right text-zinc-300 print:text-zinc-700">
                      {it.discount_percentage ? `${it.discount_percentage}%` : '—'}
                    </td>
                    <td className="p-3 text-right text-white print:text-black">{COP(it.line_total)}</td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-zinc-500">
                      Sin líneas
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totales */}
          <div className="flex justify-end">
            <div className="w-full max-w-xs space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400 print:text-zinc-600">Subtotal</span>
                <span className="text-white print:text-black">{COP(quote.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400 print:text-zinc-600">Impuestos</span>
                <span className="text-white print:text-black">{COP(quote.tax_amount)}</span>
              </div>
              <div className="flex justify-between text-lg font-semibold border-t border-zinc-800 print:border-zinc-300 pt-2">
                <span className="text-white print:text-black">Total</span>
                <span className="text-white print:text-black">{COP(quote.total_amount)}</span>
              </div>
            </div>
          </div>

          {/* Notas */}
          {quote.notes && (
            <div className="border-t border-zinc-800 print:border-zinc-300 pt-4">
              <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Notas</div>
              <p className="text-zinc-300 print:text-zinc-700 text-sm whitespace-pre-wrap">{quote.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
