'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { 
  Plus, 
  Search, 
  MoreHorizontal, 
  FileText, 
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Copy,
  Trash2,
  FileSpreadsheet
} from 'lucide-react'
import type { Quote, QuoteLineItem, Product, Contact } from '@/types/finance'

export default function QuotesPage() {
  const router = useRouter()
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  
  // Form state
  const [contacts, setContacts] = useState<Contact[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [selectedContact, setSelectedContact] = useState('')
  const [lineItems, setLineItems] = useState<QuoteLineItemFormData[]>([])
  const [notes, setNotes] = useState('')
  const [validUntil, setValidUntil] = useState('')

  useEffect(() => {
    fetchQuotes()
    fetchContacts()
    fetchProducts()
  }, [])

  async function fetchQuotes() {
    setLoading(true)
    const { data } = await supabase
      .from('quotes_view')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (data) setQuotes(data as Quote[])
    setLoading(false)
  }

  async function fetchContacts() {
    const { data } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, company_name')
      .eq('status', 'active')
    
    if (data) setContacts(data as Contact[])
  }

  async function fetchProducts() {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
    
    if (data) setProducts(data as Product[])
  }

  function addLineItem(product?: Product) {
    setLineItems([...lineItems, {
      product_id: product?.id,
      description: product?.name || '',
      quantity: 1,
      unit_price: product?.unit_price || 0,
      discount_percentage: 0,
      tax_rate: product?.tax_rate || 0
    }])
  }

  function updateLineItem(index: number, field: string, value: any) {
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
      return sum + (taxable * (item.tax_rate / 100))
    }, 0)
    
    return { subtotal, tax, total: subtotal + tax }
  }

  async function createQuote() {
    const { subtotal, tax, total } = calculateTotals()
    
    const { data: quote, error } = await supabase
      .from('quotes')
      .insert({
        contact_id: selectedContact,
        valid_until: validUntil,
        notes,
        subtotal,
        tax_amount: tax,
        total_amount: total,
        status: 'draft'
      } as any)
      .select()
      .single()
    
    if (!error && quote) {
      // Insert line items
      const itemsToInsert = lineItems.map((item, index) => ({
        quote_id: quote.id,
        ...item,
        line_total: (item.quantity * item.unit_price) * (1 - item.discount_percentage / 100) * (1 + item.tax_rate / 100),
        order_index: index
      }))
      
      await supabase.from('quote_line_items').insert(itemsToInsert as any)
      
      setIsCreateDialogOpen(false)
      setSelectedContact('')
      setLineItems([])
      setNotes('')
      setValidUntil('')
      fetchQuotes()
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
      cancelled: 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    }
    return variants[status] || variants.draft
  }

  const filteredQuotes = quotes.filter(quote => 
    quote.quote_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    quote.client_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    quote.client_company?.toLowerCase().includes(searchQuery.toLowerCase())
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
              {quotes.filter(q => q.status === 'sent' || q.status === 'viewed').length}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-sm text-zinc-400">Aceptadas</div>
            <p className="text-2xl font-bold text-green-400">
              {quotes.filter(q => q.status === 'accepted' || q.status === 'converted').length}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-sm text-zinc-400">Valor Total</div>
            <p className="text-2xl font-bold text-white">
              ${quotes.reduce((sum, q) => sum + (q.total_amount || 0), 0).toLocaleString()}
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
                    <TableCell className="font-medium text-white">
                      {quote.quote_number}
                    </TableCell>
                    <TableCell>
                      <div className="text-white">{quote.client_name}</div>
                      <div className="text-sm text-zinc-500">{quote.client_company}</div>
                    </TableCell>
                    <TableCell className="text-white">
                      ${quote.total_amount?.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getStatusBadge(quote.status)}>
                        {quote.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-zinc-400">
                      {quote.valid_until 
                        ? format(new Date(quote.valid_until), 'dd MMM yyyy', { locale: es })
                        : 'Sin fecha'
                      }
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400">
                            <MoreHorizontal className="h-4 w-4" />
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
                          <DropdownMenuItem className="text-white">
                            <Send className="h-4 w-4 mr-2" />
                            Enviar
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-white">
                            <Copy className="h-4 w-4 mr-2" />
                            Duplicar
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-400">
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
                {contacts.map(contact => (
                  <option key={contact.id} value={contact.id}>
                    {contact.first_name} {contact.last_name} - {contact.company_name}
                  </option>
                ))}
              </select>
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
              <label className="text-sm text-zinc-400 mb-1 block">Agregar productos</label>
              <div className="flex gap-2 flex-wrap">
                {products.map(product => (
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
              <div className="border border-zinc-800 rounded-lg overflow-hidden">
                <table className="w-full">
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
                            onChange={(e) => updateLineItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                          />
                        </td>
                        <td className="p-3">
                          <Input
                            type="number"
                            className="bg-zinc-900 border-zinc-800 text-white text-sm text-right"
                            value={item.unit_price}
                            onChange={(e) => updateLineItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                          />
                        </td>
                        <td className="p-3">
                          <Input
                            type="number"
                            className="bg-zinc-900 border-zinc-800 text-white text-sm text-right"
                            value={item.discount_percentage}
                            onChange={(e) => updateLineItem(index, 'discount_percentage', parseFloat(e.target.value) || 0)}
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
                  <span className="text-white">${subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Impuestos:</span>
                  <span className="text-white">${tax.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-lg font-semibold border-t border-zinc-800 pt-2">
                  <span className="text-white">Total:</span>
                  <span className="text-white">${total.toLocaleString()}</span>
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
                disabled={!selectedContact || lineItems.length === 0}
              >
                Crear Cotización
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Type for form
interface QuoteLineItemFormData {
  product_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percentage: number;
  tax_rate: number;
}
