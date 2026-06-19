'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Plus,
  Search,
  MoreHorizontal,
  FileText,
  Send,
  Eye,
  CreditCard,
  Trash2,
  DollarSign,
  Loader2,
} from 'lucide-react'
import type { Invoice, Payment } from '@/types/finance'

interface ContactOption {
  id: string
  first_name: string
  last_name?: string
  email?: string
  company_name?: string
}
interface ProductOption {
  id: string
  name: string
}
interface LineItemForm {
  product_id?: string
  description: string
  quantity: number
  unit_price: number
  discount_percentage: number
  tax_rate: number
}

const COP = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)

const statusLabels: Record<string, string> = {
  draft: 'Borrador',
  sent: 'Enviada',
  viewed: 'Vista',
  partially_paid: 'Pago parcial',
  paid: 'Pagada',
  overdue: 'Vencida',
  cancelled: 'Cancelada',
  refunded: 'Reembolsada',
  void: 'Anulada',
}

export default function InvoicesPage() {
  const router = useRouter()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [busyId, setBusyId] = useState<string | null>(null)

  // Create dialog
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [contacts, setContacts] = useState<ContactOption[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])
  const [selectedContact, setSelectedContact] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [lineItems, setLineItems] = useState<LineItemForm[]>([])

  // Payment dialog
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('bank_transfer')
  const [payRef, setPayRef] = useState('')
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    fetchInvoices()
    fetchPayments()
    fetchFormData()
  }, [])

  async function fetchInvoices() {
    setLoading(true)
    try {
      const res = await fetch('/api/invoices')
      const json = await res.json()
      if (res.ok) setInvoices((json.invoices ?? []) as Invoice[])
      else toast.error(json.error || 'No se pudieron cargar las facturas')
    } catch {
      toast.error('Error de red al cargar facturas')
    } finally {
      setLoading(false)
    }
  }

  async function fetchPayments() {
    try {
      const res = await fetch('/api/payments')
      const json = await res.json()
      if (res.ok) setPayments((json.payments ?? []) as Payment[])
    } catch {
      /* noop */
    }
  }

  async function fetchFormData() {
    try {
      const res = await fetch('/api/invoices/form-data')
      const json = await res.json()
      if (res.ok) {
        setContacts((json.contacts ?? []) as ContactOption[])
        setProducts((json.products ?? []) as ProductOption[])
      }
    } catch {
      /* noop */
    }
  }

  function addLineItem(product?: ProductOption) {
    setLineItems([
      ...lineItems,
      { product_id: product?.id, description: product?.name || '', quantity: 1, unit_price: 0, discount_percentage: 0, tax_rate: 0 },
    ])
  }
  function updateLineItem(index: number, field: string, value: string | number) {
    const updated = [...lineItems]
    updated[index] = { ...updated[index], [field]: value }
    setLineItems(updated)
  }
  function removeLineItem(index: number) {
    setLineItems(lineItems.filter((_, i) => i !== index))
  }
  function totals() {
    const subtotal = lineItems.reduce((s, it) => {
      const g = it.quantity * it.unit_price
      return s + g - g * (it.discount_percentage / 100)
    }, 0)
    const tax = lineItems.reduce((s, it) => {
      const g = it.quantity * it.unit_price
      const taxable = g - g * (it.discount_percentage / 100)
      return s + taxable * (it.tax_rate / 100)
    }, 0)
    return { subtotal, tax, total: subtotal + tax }
  }

  async function createInvoice() {
    setSaving(true)
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: selectedContact, due_date: dueDate || null, notes: notes || null, line_items: lineItems }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'No se pudo crear la factura')
        return
      }
      toast.success(`Factura ${json.invoice?.invoice_number ?? ''} creada`)
      setIsCreateOpen(false)
      setSelectedContact('')
      setDueDate('')
      setNotes('')
      setLineItems([])
      fetchInvoices()
    } catch {
      toast.error('Error de red al crear la factura')
    } finally {
      setSaving(false)
    }
  }

  async function sendInvoice(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/invoices/${id}/send`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'No se pudo enviar')
        return
      }
      toast.success(`Enviada a ${json.sent_to}`)
      fetchInvoices()
    } catch {
      toast.error('Error de red al enviar')
    } finally {
      setBusyId(null)
    }
  }

  async function voidInvoice(id: string, number?: string) {
    if (!confirm(`¿Anular la factura ${number ?? ''}?`)) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'void' }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'No se pudo anular')
        return
      }
      toast.success('Factura anulada')
      fetchInvoices()
    } catch {
      toast.error('Error de red al anular')
    } finally {
      setBusyId(null)
    }
  }

  async function submitPayment() {
    if (!payInvoice) return
    setPaying(true)
    try {
      const res = await fetch(`/api/invoices/${payInvoice.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parseFloat(payAmount) || 0, payment_method: payMethod, reference_number: payRef || null }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'No se pudo registrar el pago')
        return
      }
      toast.success('Pago registrado')
      setPayInvoice(null)
      setPayAmount('')
      setPayRef('')
      fetchInvoices()
      fetchPayments()
    } catch {
      toast.error('Error de red al registrar el pago')
    } finally {
      setPaying(false)
    }
  }

  function getStatusBadge(status: string) {
    const variants: Record<string, string> = {
      draft: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
      sent: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      viewed: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      partially_paid: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      paid: 'bg-green-500/20 text-green-400 border-green-500/30',
      overdue: 'bg-red-500/20 text-red-400 border-red-500/30',
      cancelled: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
      refunded: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      void: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    }
    return variants[status] || variants.draft
  }

  const filteredInvoices = invoices.filter((invoice) => {
    const matchesSearch =
      invoice.invoice_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      invoice.client_name?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesTab =
      activeTab === 'all' ? true :
      activeTab === 'draft' ? invoice.status === 'draft' :
      activeTab === 'sent' ? invoice.status === 'sent' || invoice.status === 'viewed' :
      activeTab === 'overdue' ? invoice.status === 'overdue' :
      activeTab === 'paid' ? invoice.status === 'paid' : true
    return matchesSearch && matchesTab
  })

  const stats = {
    total: invoices.length,
    totalAmount: invoices.reduce((sum, i) => sum + (i.total_amount || 0), 0),
    outstanding: invoices
      .filter((i) => i.status === 'sent' || i.status === 'partially_paid' || i.status === 'overdue')
      .reduce((sum, i) => sum + (i.balance_due || 0), 0),
    overdue: invoices.filter((i) => i.status === 'overdue').length,
  }

  const t = totals()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Facturación</h1>
          <p className="text-zinc-400 mt-1">Gestiona facturas y pagos</p>
        </div>
        <Button className="bg-white text-black hover:bg-zinc-200" onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Factura
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-sm text-zinc-400">Total Facturas</div>
            <p className="text-2xl font-bold text-white">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-sm text-zinc-400">Facturado Total</div>
            <p className="text-2xl font-bold text-white">{COP(stats.totalAmount)}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-sm text-zinc-400">Pendiente Cobro</div>
            <p className="text-2xl font-bold text-orange-400">{COP(stats.outstanding)}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-sm text-zinc-400">Vencidas</div>
            <p className="text-2xl font-bold text-red-400">{stats.overdue}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs + tabla */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList className="bg-zinc-900">
            <TabsTrigger value="all" className="data-[state=active]:bg-zinc-800">Todas</TabsTrigger>
            <TabsTrigger value="draft" className="data-[state=active]:bg-zinc-800">Borradores</TabsTrigger>
            <TabsTrigger value="sent" className="data-[state=active]:bg-zinc-800">Enviadas</TabsTrigger>
            <TabsTrigger value="overdue" className="data-[state=active]:bg-zinc-800">Vencidas</TabsTrigger>
            <TabsTrigger value="paid" className="data-[state=active]:bg-zinc-800">Pagadas</TabsTrigger>
          </TabsList>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input
              placeholder="Buscar facturas..."
              className="pl-10 bg-zinc-900 border-zinc-800 text-white"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <TabsContent value={activeTab} className="mt-4">
          <Card className="bg-zinc-950 border-zinc-800">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-8 text-center text-zinc-500">Cargando...</div>
              ) : filteredInvoices.length === 0 ? (
                <div className="p-8 text-center">
                  <FileText className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
                  <p className="text-zinc-500">No hay facturas</p>
                  <p className="text-zinc-600 text-sm mt-1">Crea la primera con &quot;Nueva Factura&quot;.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800">
                      <TableHead className="text-zinc-400">Número</TableHead>
                      <TableHead className="text-zinc-400">Cliente</TableHead>
                      <TableHead className="text-zinc-400">Total</TableHead>
                      <TableHead className="text-zinc-400">Saldo</TableHead>
                      <TableHead className="text-zinc-400">Estado</TableHead>
                      <TableHead className="text-zinc-400">Vencimiento</TableHead>
                      <TableHead className="text-zinc-400">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.map((invoice) => (
                      <TableRow key={invoice.id} className="border-zinc-800">
                        <TableCell className="font-medium text-white">{invoice.invoice_number}</TableCell>
                        <TableCell>
                          <div className="text-white">{invoice.client_name || '—'}</div>
                          <div className="text-sm text-zinc-500">{invoice.client_company}</div>
                        </TableCell>
                        <TableCell className="text-white">{COP(invoice.total_amount || 0)}</TableCell>
                        <TableCell className={invoice.balance_due && invoice.balance_due > 0 ? 'text-orange-400' : 'text-green-400'}>
                          {COP(invoice.balance_due || 0)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getStatusBadge(invoice.status)}>
                            {statusLabels[invoice.status] || invoice.status}
                          </Badge>
                        </TableCell>
                        <TableCell className={invoice.status === 'overdue' ? 'text-red-400' : 'text-zinc-400'}>
                          {invoice.due_date ? format(new Date(invoice.due_date), 'dd MMM yyyy', { locale: es }) : 'Sin fecha'}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400" disabled={busyId === invoice.id}>
                                {busyId === invoice.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                              <DropdownMenuItem className="text-white" onClick={() => router.push(`/dashboard/invoices/${invoice.id}`)}>
                                <Eye className="h-4 w-4 mr-2" />
                                Ver detalle
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-white" onClick={() => sendInvoice(invoice.id)}>
                                <Send className="h-4 w-4 mr-2" />
                                Enviar
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-white" onClick={() => { setPayInvoice(invoice); setPayAmount(String(invoice.balance_due || invoice.total_amount || '')) }}>
                                <CreditCard className="h-4 w-4 mr-2" />
                                Registrar pago
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-red-400" onClick={() => voidInvoice(invoice.id, invoice.invoice_number)}>
                                <Trash2 className="h-4 w-4 mr-2" />
                                Anular
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Últimos pagos */}
      <Card className="bg-zinc-950 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white text-lg">Últimos Pagos</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">No hay pagos registrados</div>
          ) : (
            <div className="space-y-3">
              {payments.slice(0, 5).map((payment) => (
                <div key={payment.id} className="flex items-center justify-between p-3 bg-zinc-900 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center">
                      <DollarSign className="h-5 w-5 text-green-400" />
                    </div>
                    <div>
                      <p className="text-white font-medium">{COP(payment.amount)}</p>
                      <p className="text-zinc-400 text-sm">{payment.payment_method} • {payment.invoice_number}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-zinc-400 text-sm">{format(new Date(payment.payment_date), 'dd MMM yyyy', { locale: es })}</p>
                    <Badge variant="outline" className={payment.status === 'completed' ? 'border-green-500 text-green-400 text-xs' : 'border-yellow-500 text-yellow-400 text-xs'}>
                      {payment.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Crear factura */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Crear Nueva Factura</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Cliente *</label>
              <select className="w-full bg-zinc-900 border border-zinc-800 rounded-md p-2 text-white" value={selectedContact} onChange={(e) => setSelectedContact(e.target.value)}>
                <option value="">Seleccionar cliente...</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>{c.first_name} {c.last_name}{c.company_name ? ` — ${c.company_name}` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Vencimiento</label>
              <Input type="date" className="bg-zinc-900 border-zinc-800 text-white" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Agregar líneas</label>
              <div className="flex gap-2 flex-wrap">
                {products.map((p) => (
                  <Button key={p.id} size="sm" variant="outline" className="border-zinc-700 text-zinc-300 text-xs" onClick={() => addLineItem(p)}>+ {p.name}</Button>
                ))}
                <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300" onClick={() => addLineItem()}>+ Línea personalizada</Button>
              </div>
            </div>
            {lineItems.length > 0 && (
              <div className="border border-zinc-800 rounded-lg overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead className="bg-zinc-900">
                    <tr>
                      <th className="text-left p-3 text-zinc-400 text-sm">Descripción</th>
                      <th className="text-center p-3 text-zinc-400 text-sm w-24">Cantidad</th>
                      <th className="text-right p-3 text-zinc-400 text-sm w-32">Precio</th>
                      <th className="text-right p-3 text-zinc-400 text-sm w-24">Desc %</th>
                      <th className="text-right p-3 text-zinc-400 text-sm w-20">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {lineItems.map((item, index) => (
                      <tr key={index}>
                        <td className="p-3"><Input className="bg-zinc-900 border-zinc-800 text-white text-sm" value={item.description} onChange={(e) => updateLineItem(index, 'description', e.target.value)} /></td>
                        <td className="p-3"><Input type="number" className="bg-zinc-900 border-zinc-800 text-white text-sm text-center" value={item.quantity} onChange={(e) => updateLineItem(index, 'quantity', parseFloat(e.target.value) || 0)} /></td>
                        <td className="p-3"><Input type="number" className="bg-zinc-900 border-zinc-800 text-white text-sm text-right" value={item.unit_price} onChange={(e) => updateLineItem(index, 'unit_price', parseFloat(e.target.value) || 0)} /></td>
                        <td className="p-3"><Input type="number" className="bg-zinc-900 border-zinc-800 text-white text-sm text-right" value={item.discount_percentage} onChange={(e) => updateLineItem(index, 'discount_percentage', parseFloat(e.target.value) || 0)} /></td>
                        <td className="p-3 text-right"><Button size="sm" variant="ghost" className="text-red-400 h-8 w-8 p-0" onClick={() => removeLineItem(index)}><Trash2 className="h-4 w-4" /></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {lineItems.length > 0 && (
              <div className="bg-zinc-900 p-4 rounded-lg space-y-2">
                <div className="flex justify-between text-sm"><span className="text-zinc-400">Subtotal:</span><span className="text-white">{COP(t.subtotal)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-zinc-400">Impuestos:</span><span className="text-white">{COP(t.tax)}</span></div>
                <div className="flex justify-between text-lg font-semibold border-t border-zinc-800 pt-2"><span className="text-white">Total:</span><span className="text-white">{COP(t.total)}</span></div>
              </div>
            )}
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Notas</label>
              <textarea className="w-full bg-zinc-900 border border-zinc-800 rounded-md p-2 text-white text-sm" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas para el cliente..." />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
              <Button className="bg-white text-black hover:bg-zinc-200" onClick={createInvoice} disabled={!selectedContact || lineItems.length === 0 || saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Crear Factura
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Registrar pago */}
      <Dialog open={!!payInvoice} onOpenChange={(o) => !o && setPayInvoice(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar pago {payInvoice?.invoice_number ? `· ${payInvoice.invoice_number}` : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {payInvoice && (
              <div className="text-sm text-zinc-400">
                Total: <span className="text-white">{COP(payInvoice.total_amount || 0)}</span> · Saldo: <span className="text-orange-400">{COP(payInvoice.balance_due || 0)}</span>
              </div>
            )}
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Monto</label>
              <Input type="number" className="bg-zinc-900 border-zinc-800 text-white" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Método</label>
              <select className="w-full bg-zinc-900 border border-zinc-800 rounded-md p-2 text-white" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                <option value="bank_transfer">Transferencia</option>
                <option value="cash">Efectivo</option>
                <option value="credit_card">Tarjeta crédito</option>
                <option value="debit_card">Tarjeta débito</option>
                <option value="mercadopago">MercadoPago</option>
                <option value="stripe">Stripe</option>
                <option value="paypal">PayPal</option>
                <option value="other">Otro</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Referencia (opcional)</label>
              <Input className="bg-zinc-900 border-zinc-800 text-white" value={payRef} onChange={(e) => setPayRef(e.target.value)} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={() => setPayInvoice(null)}>Cancelar</Button>
              <Button className="bg-white text-black hover:bg-zinc-200" onClick={submitPayment} disabled={!payAmount || paying}>
                {paying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Registrar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
