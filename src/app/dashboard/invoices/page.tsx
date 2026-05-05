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
  Eye,
  CreditCard,
  Trash2,
  DollarSign
} from 'lucide-react'
import type { Invoice, Payment } from '@/types/finance'

export default function InvoicesPage() {
  const router = useRouter()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState('all')

  useEffect(() => {
    fetchInvoices()
    fetchPayments()
  }, [])

  async function fetchInvoices() {
    setLoading(true)
    const { data } = await supabase
      .from('invoices_view')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (data) setInvoices(data as Invoice[])
    setLoading(false)
  }

  async function fetchPayments() {
    const { data } = await supabase
      .from('payments')
      .select('*')
      .order('payment_date', { ascending: false })
      .limit(50)
    
    if (data) setPayments(data as Payment[])
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
      void: 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    }
    return variants[status] || variants.draft
  }

  const filteredInvoices = invoices.filter(invoice => {
    const matchesSearch = 
      invoice.invoice_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      invoice.client_name?.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesTab = 
      activeTab === 'all' ? true :
      activeTab === 'draft' ? invoice.status === 'draft' :
      activeTab === 'sent' ? invoice.status === 'sent' || invoice.status === 'viewed' :
      activeTab === 'overdue' ? invoice.status === 'overdue' :
      activeTab === 'paid' ? invoice.status === 'paid' :
      true
    
    return matchesSearch && matchesTab
  })

  const stats = {
    total: invoices.length,
    totalAmount: invoices.reduce((sum, i) => sum + (i.total_amount || 0), 0),
    outstanding: invoices.filter(i => i.status === 'sent' || i.status === 'partially_paid' || i.status === 'overdue').reduce((sum, i) => sum + (i.balance_due || 0), 0),
    overdue: invoices.filter(i => i.status === 'overdue').length
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Facturación</h1>
          <p className="text-zinc-400 mt-1">Gestiona facturas y pagos</p>
        </div>
        <Button 
          className="bg-white text-black hover:bg-zinc-200"
          onClick={() => router.push('/dashboard/invoices/new')}
        >
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
            <p className="text-2xl font-bold text-white">${stats.totalAmount.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-sm text-zinc-400">Pendiente Cobro</div>
            <p className="text-2xl font-bold text-orange-400">${stats.outstanding.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-sm text-zinc-400">Vencidas</div>
            <p className="text-2xl font-bold text-red-400">{stats.overdue}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs y Filtros */}
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
                        <TableCell className="font-medium text-white">
                          {invoice.invoice_number}
                        </TableCell>
                        <TableCell>
                          <div className="text-white">{invoice.client_name}</div>
                          <div className="text-sm text-zinc-500">{invoice.client_company}</div>
                        </TableCell>
                        <TableCell className="text-white">
                          ${invoice.total_amount?.toLocaleString()}
                        </TableCell>
                        <TableCell className={invoice.balance_due && invoice.balance_due > 0 ? 'text-orange-400' : 'text-green-400'}>
                          ${(invoice.balance_due || 0).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getStatusBadge(invoice.status)}>
                            {invoice.status}
                          </Badge>
                        </TableCell>
                        <TableCell className={invoice.status === 'overdue' ? 'text-red-400' : 'text-zinc-400'}>
                          {invoice.due_date 
                            ? format(new Date(invoice.due_date), 'dd MMM yyyy', { locale: es })
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
                                onClick={() => router.push(`/dashboard/invoices/${invoice.id}`)}
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                Ver detalle
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-white">
                                <Send className="h-4 w-4 mr-2" />
                                Enviar
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-white">
                                <CreditCard className="h-4 w-4 mr-2" />
                                Registrar pago
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-red-400">
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

      {/* Ultimos Pagos */}
      <Card className="bg-zinc-950 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white text-lg">Últimos Pagos</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">
              No hay pagos registrados
            </div>
          ) : (
            <div className="space-y-3">
              {payments.slice(0, 5).map((payment) => (
                <div key={payment.id} className="flex items-center justify-between p-3 bg-zinc-900 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center">
                      <DollarSign className="h-5 w-5 text-green-400" />
                    </div>
                    <div>
                      <p className="text-white font-medium">
                        ${payment.amount.toLocaleString()}
                      </p>
                      <p className="text-zinc-400 text-sm">
                        {payment.payment_method} • {payment.invoice_number}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-zinc-400 text-sm">
                      {format(new Date(payment.payment_date), 'dd MMM yyyy', { locale: es })}
                    </p>
                    <Badge variant="outline" className={
                      payment.status === 'completed' 
                        ? 'border-green-500 text-green-400 text-xs' 
                        : 'border-yellow-500 text-yellow-400 text-xs'
                    }>
                      {payment.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
