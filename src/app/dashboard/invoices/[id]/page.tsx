'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeft, Send, CreditCard, Trash2, Printer, Loader2 } from 'lucide-react'
import type { Invoice, InvoiceLineItem, Payment } from '@/types/finance'

const COP = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)

const statusLabels: Record<string, string> = {
  draft: 'Borrador', sent: 'Enviada', viewed: 'Vista', partially_paid: 'Pago parcial',
  paid: 'Pagada', overdue: 'Vencida', cancelled: 'Cancelada', refunded: 'Reembolsada', void: 'Anulada',
}
const statusBadge: Record<string, string> = {
  draft: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  sent: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  partially_paid: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  paid: 'bg-green-500/20 text-green-400 border-green-500/30',
  overdue: 'bg-red-500/20 text-red-400 border-red-500/30',
  void: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
}

export default function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [items, setItems] = useState<InvoiceLineItem[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/invoices/${params.id}`)
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'No se encontró la factura')
        return
      }
      setInvoice(json.invoice as Invoice)
      setItems((json.items ?? []) as InvoiceLineItem[])
      setPayments((json.payments ?? []) as Payment[])
    } catch {
      toast.error('Error de red al cargar la factura')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => { load() }, [load])

  async function send() {
    setBusy(true)
    try {
      const res = await fetch(`/api/invoices/${params.id}/send`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'No se pudo enviar'); return }
      toast.success(`Enviada a ${json.sent_to}`); load()
    } finally { setBusy(false) }
  }

  async function registerPayment() {
    const amountStr = prompt('Monto del pago (COP):', String(invoice?.balance_due || invoice?.total_amount || ''))
    if (!amountStr) return
    setBusy(true)
    try {
      const res = await fetch(`/api/invoices/${params.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parseFloat(amountStr) || 0, payment_method: 'bank_transfer' }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'No se pudo registrar el pago'); return }
      toast.success('Pago registrado'); load()
    } finally { setBusy(false) }
  }

  async function voidInvoice() {
    if (!confirm('¿Anular esta factura?')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/invoices/${params.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'void' }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'No se pudo anular'); return }
      toast.success('Factura anulada'); load()
    } finally { setBusy(false) }
  }

  if (loading) return <div className="p-8 text-center text-zinc-500">Cargando...</div>
  if (!invoice) {
    return (
      <div className="p-8 text-center text-zinc-500">
        Factura no encontrada.
        <div className="mt-4"><Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={() => router.push('/dashboard/invoices')}>Volver</Button></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Button variant="ghost" className="text-zinc-400 hover:text-white" onClick={() => router.push('/dashboard/invoices')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Facturación
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" /> PDF / Imprimir</Button>
          <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={send} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />} Enviar</Button>
          <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={registerPayment} disabled={busy}><CreditCard className="h-4 w-4 mr-2" /> Registrar pago</Button>
          <Button variant="outline" className="border-red-900 text-red-400 hover:bg-red-950" onClick={voidInvoice} disabled={busy}><Trash2 className="h-4 w-4 mr-2" /> Anular</Button>
        </div>
      </div>

      <Card className="bg-zinc-950 border-zinc-800 print:bg-white print:text-black">
        <CardContent className="p-8 space-y-8">
          <div className="flex items-start justify-between">
            <div>
              <img src="https://www.inventagency.co/logo-white.png" alt="Invent Agency" className="h-8 w-auto mb-3 print:hidden" />
              <h1 className="text-2xl font-bold text-white print:text-black">Factura {invoice.invoice_number}</h1>
              <p className="text-zinc-400 print:text-zinc-600 mt-1">{invoice.issue_date ? format(new Date(invoice.issue_date), "dd 'de' MMMM yyyy", { locale: es }) : ''}</p>
            </div>
            <Badge variant="outline" className={statusBadge[invoice.status] || statusBadge.draft}>{statusLabels[invoice.status] || invoice.status}</Badge>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Cliente</div>
              <div className="text-white print:text-black font-medium">{invoice.client_name || '—'}</div>
              {invoice.client_company && <div className="text-zinc-400 print:text-zinc-600 text-sm">{invoice.client_company}</div>}
              {invoice.client_email && <div className="text-zinc-400 print:text-zinc-600 text-sm">{invoice.client_email}</div>}
            </div>
            <div className="md:text-right">
              <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Vencimiento</div>
              <div className="text-white print:text-black">{invoice.due_date ? format(new Date(invoice.due_date), 'dd MMM yyyy', { locale: es }) : 'Sin fecha'}</div>
            </div>
          </div>

          <div className="border border-zinc-800 print:border-zinc-300 rounded-lg overflow-x-auto">
            <table className="w-full">
              <thead className="bg-zinc-900 print:bg-zinc-100">
                <tr>
                  <th className="text-left p-3 text-zinc-400 print:text-zinc-600 text-sm">Descripción</th>
                  <th className="text-center p-3 text-zinc-400 print:text-zinc-600 text-sm">Cant.</th>
                  <th className="text-right p-3 text-zinc-400 print:text-zinc-600 text-sm">Precio</th>
                  <th className="text-right p-3 text-zinc-400 print:text-zinc-600 text-sm">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800 print:divide-zinc-300">
                {items.map((it) => (
                  <tr key={it.id}>
                    <td className="p-3 text-white print:text-black">{it.description || '—'}</td>
                    <td className="p-3 text-center text-zinc-300 print:text-zinc-700">{it.quantity}</td>
                    <td className="p-3 text-right text-zinc-300 print:text-zinc-700">{COP(it.unit_price)}</td>
                    <td className="p-3 text-right text-white print:text-black">{COP(it.line_total)}</td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-zinc-500">Sin líneas</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <div className="w-full max-w-xs space-y-2">
              <div className="flex justify-between text-sm"><span className="text-zinc-400 print:text-zinc-600">Subtotal</span><span className="text-white print:text-black">{COP(invoice.subtotal)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-zinc-400 print:text-zinc-600">Impuestos</span><span className="text-white print:text-black">{COP(invoice.tax_amount)}</span></div>
              <div className="flex justify-between text-lg font-semibold border-t border-zinc-800 print:border-zinc-300 pt-2"><span className="text-white print:text-black">Total</span><span className="text-white print:text-black">{COP(invoice.total_amount)}</span></div>
              {(invoice.amount_paid || 0) > 0 && (
                <>
                  <div className="flex justify-between text-sm"><span className="text-zinc-400 print:text-zinc-600">Pagado</span><span className="text-green-400">{COP(invoice.amount_paid)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-zinc-400 print:text-zinc-600">Saldo</span><span className="text-orange-400">{COP(invoice.balance_due || (invoice.total_amount - invoice.amount_paid))}</span></div>
                </>
              )}
            </div>
          </div>

          {payments.length > 0 && (
            <div className="border-t border-zinc-800 print:border-zinc-300 pt-4">
              <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Pagos</div>
              <div className="space-y-2">
                {payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <span className="text-zinc-300 print:text-zinc-700">{format(new Date(p.payment_date), 'dd MMM yyyy', { locale: es })} · {p.payment_method}</span>
                    <span className="text-green-400">{COP(p.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {invoice.notes && (
            <div className="border-t border-zinc-800 print:border-zinc-300 pt-4">
              <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Notas</div>
              <p className="text-zinc-300 print:text-zinc-700 text-sm whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
