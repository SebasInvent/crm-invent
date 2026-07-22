'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { EmptyState } from '@/components/ui/empty-state'
import {
  useSupabaseQuery,
  useSupabaseMutation,
  queryKeys,
} from '@/lib/hooks/useSupabaseQuery'
import {
  Plus,
  Search,
  Filter,
  Building2,
  Mail,
  Phone,
  MapPin,
  Tag,
  Star,
  TrendingUp,
  MoreHorizontal,
  User,
  Calendar,
  MessageCircle,
} from 'lucide-react'
import type { Contact, Deal, ActivityLog } from '@/types/crm-core'

type NewContactInput = {
  first_name: string
  last_name: string
  email: string
  phone: string
  company_name: string
  job_title: string
  type: 'lead' | 'prospect' | 'customer' | 'partner' | 'supplier'
  source: 'manual' | 'web_form' | 'telegram' | 'openclaw' | 'referral' | 'linkedin'
}

const emptyContactForm: NewContactInput = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  company_name: '',
  job_title: '',
  type: 'lead',
  source: 'manual',
}

export default function ContactsPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [newContact, setNewContact] = useState<NewContactInput>(emptyContactForm)

  // Query: contacts list, scoped by filterType. The cache key includes
  // filterType so switching filter doesn't show stale data and going back
  // to a previously-loaded filter is instant.
  const {
    data: contacts = [],
    isLoading: loading,
  } = useSupabaseQuery<Contact[]>({
    queryKey: queryKeys.contacts.list(filterType),
    queryFn: async () => {
      let query = supabase
        .from('contacts_with_organization')
        .select('*')
        .order('created_at', { ascending: false })
      if (filterType !== 'all') query = query.eq('type', filterType)
      return query as unknown as Promise<{ data: Contact[] | null; error: { message: string } | null }>
    },
  })

  // Mutation: create contact. On success the cache is invalidated, the
  // dialog closes, and the form resets — no manual refetch needed.
  const createContactMutation = useSupabaseMutation<NewContactInput, void>({
    mutationFn: async (input) => {
      const { error } = await supabase
        .from('contacts')
        .insert(input as any)
      if (error) throw new Error(error.message)
    },
    invalidateKeys: [queryKeys.contacts.all],
    successMessage: (_, input) =>
      `Contacto creado: ${input.first_name} ${input.last_name}`.trim(),
    errorMessage: 'No se pudo crear el contacto',
    onSuccess: () => {
      setIsCreateDialogOpen(false)
      setNewContact(emptyContactForm)
    },
  })

  function createContact() {
    if (!newContact.first_name.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    createContactMutation.mutate(newContact)
  }

  const filteredContacts = contacts.filter(contact => {
    const searchLower = searchQuery.toLowerCase()
    return (
      contact.first_name?.toLowerCase().includes(searchLower) ||
      contact.last_name?.toLowerCase().includes(searchLower) ||
      contact.email?.toLowerCase().includes(searchLower) ||
      contact.company_name?.toLowerCase().includes(searchLower) ||
      contact.phone?.toLowerCase().includes(searchLower)
    )
  })

  function getTypeBadge(type: string) {
    const variants: Record<string, string> = {
      lead: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      prospect: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      customer: 'bg-green-500/20 text-green-400 border-green-500/30',
      partner: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      supplier: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
      vendor: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
      influencer: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
      employee: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    }
    return variants[type] || variants.lead
  }

  function getPriorityBadge(priority: string) {
    const variants: Record<string, string> = {
      critical: 'bg-red-500/20 text-red-400 border-red-500/30',
      high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      low: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
    }
    return variants[priority] || variants.low
  }

  const stats = {
    total: contacts.length,
    leads: contacts.filter(c => c.type === 'lead').length,
    customers: contacts.filter(c => c.type === 'customer').length,
    prospects: contacts.filter(c => c.type === 'prospect').length,
    partners: contacts.filter(c => c.type === 'partner').length,
    totalValue: contacts.reduce((sum, c) => sum + (c.lifetime_value || 0), 0)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Contactos 360°</h1>
          <p className="text-zinc-400 mt-1">Gestiona todos tus contactos en un solo lugar</p>
        </div>
        <Button 
          className="bg-white text-black hover:bg-zinc-200"
          onClick={() => setIsCreateDialogOpen(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Contacto
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-6">
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-sm text-zinc-400">Total</div>
            <div className="text-2xl font-bold text-white">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-sm text-zinc-400">Leads</div>
            <div className="text-2xl font-bold text-blue-400">{stats.leads}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-sm text-zinc-400">Prospectos</div>
            <div className="text-2xl font-bold text-yellow-400">{stats.prospects}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-sm text-zinc-400">Clientes</div>
            <div className="text-2xl font-bold text-green-400">{stats.customers}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-sm text-zinc-400">Partners</div>
            <div className="text-2xl font-bold text-purple-400">{stats.partners}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-sm text-zinc-400">LTV Total</div>
            <div className="text-2xl font-bold text-white">
              ${stats.totalValue.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Buscar contactos..."
            className="pl-10 bg-zinc-900 border-zinc-800 text-white"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-48 bg-zinc-900 border-zinc-800 text-white">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filtrar por tipo..." />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800">
            <SelectItem value="all" className="text-white">Todos los tipos</SelectItem>
            <SelectItem value="lead" className="text-white">Leads</SelectItem>
            <SelectItem value="prospect" className="text-white">Prospectos</SelectItem>
            <SelectItem value="customer" className="text-white">Clientes</SelectItem>
            <SelectItem value="partner" className="text-white">Partners</SelectItem>
            <SelectItem value="supplier" className="text-white">Proveedores</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Contacts List */}
      <Card className="bg-zinc-950 border-zinc-800">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-zinc-500">Cargando contactos...</div>
          ) : filteredContacts.length === 0 ? (
            <EmptyState
              icon={User}
              title={searchQuery || filterType !== 'all' ? 'Sin resultados' : 'Aún no tienes contactos'}
              description={
                searchQuery || filterType !== 'all'
                  ? 'Prueba con otros términos o cambia el filtro de tipo.'
                  : 'Crea tu primer contacto manualmente o conecta una integración para que entren solos.'
              }
              action={
                !searchQuery && filterType === 'all' ? (
                  <Button
                    className="bg-white text-black hover:bg-zinc-200"
                    onClick={() => setIsCreateDialogOpen(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Nuevo contacto
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="divide-y divide-zinc-800">
              {filteredContacts.map((contact) => (
                <Link
                  key={contact.id}
                  href={`/dashboard/contacts/${contact.id}`}
                  className="flex items-center p-4 hover:bg-zinc-900/50 transition-colors"
                >
                  {/* Avatar */}
                  <div className="h-10 w-10 rounded-full bg-zinc-800 flex items-center justify-center text-white font-medium mr-4">
                    {contact.first_name.charAt(0).toUpperCase()}
                  </div>
                  
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-white">
                        {contact.first_name} {contact.last_name}
                      </h3>
                      <Badge 
                        variant="outline" 
                        className={getTypeBadge(contact.type)}
                      >
                        {contact.type}
                      </Badge>
                      <Badge 
                        variant="outline" 
                        className={getPriorityBadge(contact.priority)}
                      >
                        {contact.priority}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-zinc-400 mt-1">
                      {contact.company_name && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {contact.company_name}
                        </span>
                      )}
                      {contact.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {contact.email}
                        </span>
                      )}
                      {contact.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {contact.phone}
                        </span>
                      )}
                    </div>
                    
                    {contact.tags && contact.tags.length > 0 && (
                      <div className="flex items-center gap-1 mt-2">
                        <Tag className="h-3 w-3 text-zinc-500" />
                        {contact.tags.map((tag, i) => (
                          <span key={i} className="text-xs text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {/* Metrics */}
                  <div className="text-right ml-4">
                    <div className="text-sm text-zinc-400">Lead Score</div>
                    <div className="flex items-center gap-1">
                      <Star className="h-4 w-4 text-yellow-500" />
                      <span className="font-medium text-white">{contact.lead_score}</span>
                    </div>
                    {contact.lifetime_value > 0 && (
                      <div className="text-sm text-zinc-500 mt-1">
                        LTV: ${contact.lifetime_value.toLocaleString()}
                      </div>
                    )}
                  </div>
                  
                  {/* Assigned */}
                  {contact.assigned_to_name && (
                    <div className="ml-4 text-xs text-zinc-500">
                      Asignado a: {contact.assigned_to_name}
                    </div>
                  )}

                  <div className="ml-4 hidden items-center gap-1.5 text-xs text-emerald-400 lg:flex">
                    <MessageCircle className="h-4 w-4" />
                    Abrir conversación
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Contact Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>Crear Nuevo Contacto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Nombre *</label>
                <Input
                  className="bg-zinc-900 border-zinc-800 text-white"
                  value={newContact.first_name}
                  onChange={(e) => setNewContact({...newContact, first_name: e.target.value})}
                />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Apellido</label>
                <Input
                  className="bg-zinc-900 border-zinc-800 text-white"
                  value={newContact.last_name}
                  onChange={(e) => setNewContact({...newContact, last_name: e.target.value})}
                />
              </div>
            </div>
            
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Email</label>
              <Input
                type="email"
                className="bg-zinc-900 border-zinc-800 text-white"
                value={newContact.email}
                onChange={(e) => setNewContact({...newContact, email: e.target.value})}
              />
            </div>
            
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Teléfono</label>
              <Input
                className="bg-zinc-900 border-zinc-800 text-white"
                value={newContact.phone}
                onChange={(e) => setNewContact({...newContact, phone: e.target.value})}
              />
            </div>
            
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Empresa</label>
              <Input
                className="bg-zinc-900 border-zinc-800 text-white"
                value={newContact.company_name}
                onChange={(e) => setNewContact({...newContact, company_name: e.target.value})}
              />
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Tipo</label>
                <Select
                  value={newContact.type}
                  onValueChange={(value) => setNewContact({...newContact, type: value as NewContactInput['type']})}
                >
                  <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="lead" className="text-white">Lead</SelectItem>
                    <SelectItem value="prospect" className="text-white">Prospecto</SelectItem>
                    <SelectItem value="customer" className="text-white">Cliente</SelectItem>
                    <SelectItem value="partner" className="text-white">Partner</SelectItem>
                    <SelectItem value="supplier" className="text-white">Proveedor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Origen</label>
                <Select
                  value={newContact.source}
                  onValueChange={(value) => setNewContact({...newContact, source: value as NewContactInput['source']})}
                >
                  <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="manual" className="text-white">Manual</SelectItem>
                    <SelectItem value="web_form" className="text-white">Web</SelectItem>
                    <SelectItem value="telegram" className="text-white">Telegram</SelectItem>
                    <SelectItem value="openclaw" className="text-white">OpenClaw</SelectItem>
                    <SelectItem value="referral" className="text-white">Referido</SelectItem>
                    <SelectItem value="linkedin" className="text-white">LinkedIn</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
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
                onClick={createContact}
                disabled={!newContact.first_name || createContactMutation.isPending}
              >
                {createContactMutation.isPending ? 'Creando…' : 'Crear Contacto'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
