'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
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
  Copy,
  Trash2,
  Loader2,
} from 'lucide-react'
import type { Quote } from '@/types/finance'

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

interface QuoteLineItemFormData {
  product_id?: string
  description: string
  quantity: number
  unit_price: number
  discount_percentage: number
  tax_rate: number
}

const COP = (n: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n || 0)

export default function QuotesPage() {
  const router = useRouter()
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Form state
  const [contacts, setContacts] = useState<ContactOption[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])
  const [selectedContact, setSelectedContact] = useState('')
  const [lineItems, setLineItems] = useState<QuoteLineItemFormData[]>([])
  const [notes, setNotes] = useState('')
  const [validUntil, setValidUntil] = useState('')

  useEffect(() => {
    fetchQuotes()
    fetchFormData()
  }, [])

  async function fetchQuotes() {
    setLoading(true)
    try {
      const res = await fetch('/api/quotes')
      const json = await res.json()
      if (res.ok) setQuotes((json.quotes ?? []) as Quote[])
      else toast.error(json.error || 'No se pudieron cargar las cotizaciones')
    } catch {
      toast.error('Error de red al cargar cotizaciones')
    } finally {
      setLoading(false)
    }
  }

  async function fetchFormData() {
    try {
      const res = await fetch('/api/quotes/form-data')
      const json = await res.json()
      if (res.ok) {
        setContacts((json.contacts ?? []) as ContactOption[])
        setProducts((json.products ?? []) as ProductOption[])
      }
    } catch {
      // silencioso: el diálogo aún permite líneas personalizadas
    }
  }

  function addLineItem(product?: ProductOption) {
    setLineItems([
      ...lineItems,
      {
        product_id: product?.id,
        description: product?.name || '',
        quantity: 1,
        unit_price: 0,
        discount_percentage: 0,
        tax_rate: 0,
      },
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

  function calculateTotals() {
    const subtotal = lineItems.reduce((sum, item) => {
      const itemTotal = item.quantity * item.unit_price
      const discount = itemTotal * (item.discount_percentage / 100)
      return sum + itemTotal - discount
    }, 0)

    const tax = lineItems.reduce((sum, item) => {
      const itemTotal = item.quantity * item.unit_price
      const discount = itemTotal * (item.discount_percentage / 100)
      const taxable = itemTotal - discount
      return sum + taxable * (item.tax_rate / 100)
    }, 0)

    return { subtotal, tax, total: subtotal + tax }
  }

  async function createQuote() {
    setSaving(true)
    try {
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: selectedContact,
          valid_until: validUntil || null,
          notes: notes || null,
          line_items: lineItems,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'No se pudo crear la cotización')
        return
      }
      toast.success(`Cotización ${json.quote?.quote_number ?? ''} creada`)
      setIsCreateDialogOpen(false)
      setSelectedContact('')
      setLineItems([])
      setNotes('')
      setValidUntil('')
      fetchQuotes()
    } catch {
      toast.error('Error de red al crear la cotización')
    } finally {
      setSaving(false)
    }
  }

  async function sendQuote(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/quotes/${id}/send`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'No se pudo enviar')
        return
      }
      toast.success(`Enviada a ${json.sent_to}`)
      fetchQuotes()
    } catch {
      toast.error('Error de red al enviar')
    } finally {
      setBusyId(null)
    }
  }

  async function duplicateQuote(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/quotes/${id}/duplicate`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'No se pudo duplicar')
        return
      }
      toast.success(`Duplicada como ${json.quote?.quote_number ?? 'nueva'}`)
      fetchQuotes()
    } catch {
      toast.error('Error de red al duplicar')
    } finally {
      setBusyId(null)
    }
  }

  async function deleteQuote(id: string, number?: string) {
    if (!confirm(`¿Eliminar la cotización ${number ?? ''}? Esta acción no se puede deshacer.`)) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/quotes/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'No se pudo eliminar')
        return
      }
      toast.success('Cotización eliminada')
      fetchQuotes()
    } catch {
      toast.error('Error de red al eliminar')
    } finally {
      setBusyId(null)
    }
  }

  function getStatusBadge(status: string) {
    const variants: Record<string, string> = {
      draft: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
      sent: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      viewed: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      accepted: 'bg-green-500/20 text-green-400 border-green-500/30',
      rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
      expired: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      converted: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      cancelled: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    }
    return variants[status] || variants.draft
  }

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

  const filteredQuotes = quotes.filter(
    (quote) =>
      quote.quote_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      quote.client_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      quote.client_company?.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const { subtotal, tax, total } = calculateTotals()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Cotizaciones</h1>
          <p className="text-zinc-400 mt-1">Gestiona propuestas y cotizaciones para clientes</p>
        </div>
        <Button
          className="bg-white text-black hover:bg-zinc-200"
          onClick={() => setIsCreateDialogOpen(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Nueva Cotización
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-sm text-zinc-400">Total Cotizaciones</div>
            <p className="text-2xl font-bold text-white">{quotes.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-sm text-zinc-400">Pendientes</div>
            <p className="text-2xl font-bold text-yellow-400">
              {quotes.filter((q) => q.status === 'sent' || q.status === 'viewed').length}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-sm text-zinc-400">Aceptadas</div>
            <p className="text-2xl font-bold text-green-400">
              {quotes.filter((q) => q.status === 'accepted' || q.status === 'converted').length}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-sm text-zinc-400">Valor Total</div>
            <p className="text-2xl font-bold text-white">
              {COP(quotes.reduce((sum, q) => sum + (q.total_amount || 0), 0))}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
        <Input
          placeholder="Buscar cotizaciones..."
          className="pl-10 bg-zinc-900 border-zinc-800 text-white"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Quotes List */}
      <Card className="bg-zinc-950 border-zinc-800">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-zinc-500">Cargando...</div>
          ) : filteredQuotes.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
              <p className="text-zinc-500">No hay cotizaciones</p>
              <p className="text-zinc-600 text-sm mt-1">
                Crea la primera con el botón &quot;Nueva Cotización&quot;.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800">
                  <TableHead className="text-zinc-400">Número</TableHead>
                  <TableHead className="text-zinc-400">Cliente</TableHead>
                  <TableHead className="text-zinc-400">Total</TableHead>
                  <TableHead className="text-zinc-400">Estado</TableHead>
                  <TableHead className="text-zinc-400">Válido hasta</TableHead>
                  <TableHead className="text-zinc-400">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQuotes.map((quote) => (
                  <TableRow key={quote.id} className="border-zinc-800">
                    <TableCell className="font-medium text-white">{quote.quote_number}</TableCell>
                    <TableCell>
                      <div className="text-white">{quote.client_name || '—'}</div>
                      <div className="text-sm text-zinc-500">{quote.client_company}</div>
                    </TableCell>
                    <TableCell className="text-white">{COP(quote.total_amount || 0)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getStatusBadge(quote.status)}>
                        {statusLabels[quote.status] || quote.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-zinc-400">
                      {quote.valid_until
                        ? format(new Date(quote.valid_until), 'dd MMM yyyy', { locale: es })
                        : 'Sin fecha'}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-zinc-400"
                            disabled={busyId === quote.id}
                          >
                            {busyId === quote.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <MoreHorizontal className="h-4 w-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                          <DropdownMenuItem
                            className="text-white"
                            onClick={() => router.push(`/dashboard/quotes/${quote.id}`)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Ver detalle
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-white" onClick={() => sendQuote(quote.id)}>
                            <Send className="h-4 w-4 mr-2" />
                            Enviar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-white"
                            onClick={() => duplicateQuote(quote.id)}
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Duplicar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-400"
                            onClick={() => deleteQuote(quote.id, quote.quote_number)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Eliminar
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

      {/* Create Quote Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Crear Nueva Cotización</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* Cliente */}
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Cliente *</label>
              <select
                className="w-full bg-zinc-900 border border-zinc-800 rounded-md p-2 text-white"
                value={selectedContact}
                onChange={(e) => setSelectedContact(e.target.value)}
              >
                <option value="">Seleccionar cliente...</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.first_name} {contact.last_name}
                    {contact.company_name ? ` — ${contact.company_name}` : ''}
                  </option>
                ))}
              </select>
              {contacts.length === 0 && (
                <p className="text-xs text-zinc-600 mt-1">
                  No hay contactos activos. Crea uno en Contactos 360°.
                </p>
              )}
            </div>

            {/* Válido hasta */}
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Válido hasta</label>
              <Input
                type="date"
                className="bg-zinc-900 border-zinc-800 text-white"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>

            {/* Productos */}
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Agregar líneas</label>
              <div className="flex gap-2 flex-wrap">
                {products.map((product) => (
                  <Button
                    key={product.id}
                    size="sm"
                    variant="outline"
                    className="border-zinc-700 text-zinc-300 text-xs"
                    onClick={() => addLineItem(product)}
                  >
                    + {product.name}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  className="border-zinc-700 text-zinc-300"
                  onClick={() => addLineItem()}
                >
                  + Línea personalizada
                </Button>
              </div>
            </div>

            {/* Líneas de cotización */}
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
                        <td className="p-3">
                          <Input
                            className="bg-zinc-900 border-zinc-800 text-white text-sm"
                            value={item.description}
                            onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                          />
                        </td>
                        <td className="p-3">
                          <Input
                            type="number"
                            className="bg-zinc-900 border-zinc-800 text-white text-sm text-center"
                            value={item.quantity}
                            onChange={(e) =>
                              updateLineItem(index, 'quantity', parseFloat(e.target.value) || 0)
                            }
                          />
                        </td>
                        <td className="p-3">
                          <Input
                            type="number"
                            className="bg-zinc-900 border-zinc-800 text-white text-sm text-right"
                            value={item.unit_price}
                            onChange={(e) =>
                              updateLineItem(index, 'unit_price', parseFloat(e.target.value) || 0)
                            }
                          />
                        </td>
                        <td className="p-3">
                          <Input
                            type="number"
                            className="bg-zinc-900 border-zinc-800 text-white text-sm text-right"
                            value={item.discount_percentage}
                            onChange={(e) =>
                              updateLineItem(
                                index,
                                'discount_percentage',
                                parseFloat(e.target.value) || 0,
                              )
                            }
                          />
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-400 h-8 w-8 p-0"
                            onClick={() => removeLineItem(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Totales */}
            {lineItems.length > 0 && (
              <div className="bg-zinc-900 p-4 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Subtotal:</span>
                  <span className="text-white">{COP(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Impuestos:</span>
                  <span className="text-white">{COP(tax)}</span>
                </div>
                <div className="flex justify-between text-lg font-semibold border-t border-zinc-800 pt-2">
                  <span className="text-white">Total:</span>
                  <span className="text-white">{COP(total)}</span>
                </div>
              </div>
            )}

            {/* Notas */}
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Notas</label>
              <textarea
                className="w-full bg-zinc-900 border border-zinc-800 rounded-md p-2 text-white text-sm"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas adicionales para el cliente..."
              />
            </div>

            {/* Botones */}
            <div className="flex justify-end gap-3 pt-4">
              <Button
                variant="outline"
                className="border-zinc-700 text-zinc-300"
                onClick={() => setIsCreateDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                className="bg-white text-black hover:bg-zinc-200"
                onClick={createQuote}
                disabled={!selectedContact || lineItems.length === 0 || saving}
              >
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Crear Cotización
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
