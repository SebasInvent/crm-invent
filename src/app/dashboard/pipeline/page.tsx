'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { 
  Plus, 
  Search, 
  MoreHorizontal, 
  Calendar, 
  User, 
  DollarSign,
  TrendingUp,
  Filter,
  Kanban
} from 'lucide-react'
import type { Deal, PipelineStage, Contact } from '@/types/crm-core'

interface KanbanColumnData {
  id: string;
  name: string;
  color: string;
  order_index: number;
  probability: number;
  deals: Deal[];
}

export default function PipelinePage() {
  const router = useRouter()
  const [stages, setStages] = useState<KanbanColumnData[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [selectedPipeline, setSelectedPipeline] = useState<string>('default')
  
  // Form state
  const [newDeal, setNewDeal] = useState({
    name: '',
    contact_id: '',
    value: '',
    stage_id: '',
    expected_close_date: '',
    description: ''
  })

  useEffect(() => {
    fetchData()
  }, [selectedPipeline])

  async function fetchData() {
    setLoading(true)
    try {
      // Run independent queries in parallel — much faster on first paint
      const [stagesRes, dealsRes, contactsRes] = await Promise.all([
        supabase
          .from('pipeline_stages')
          .select('*')
          .eq('is_active', true)
          .order('order_index'),
        supabase
          .from('deals_full')
          .select('*')
          .eq('status', 'open')
          .order('updated_at', { ascending: false }),
        supabase
          .from('contacts')
          .select('id, first_name, last_name, email, company_name')
          .eq('status', 'active')
          .order('first_name'),
      ])

      if (stagesRes.error) throw stagesRes.error
      if (dealsRes.error) throw dealsRes.error
      if (contactsRes.error) throw contactsRes.error

      const stagesData = stagesRes.data
      const dealsData = dealsRes.data
      const contactsData = contactsRes.data

      if (stagesData && dealsData) {
        const columns: KanbanColumnData[] = (stagesData as PipelineStage[]).map(stage => ({
          id: stage.id,
          name: stage.name,
          color: stage.color,
          order_index: stage.order_index,
          probability: stage.default_probability,
          deals: (dealsData as Deal[]).filter(d => d.stage_id === stage.id) || []
        }))
        setStages(columns)
      }

      if (contactsData) {
        setContacts(contactsData)
      }
    } catch (err) {
      console.error('Error fetching pipeline:', err)
      toast.error('No se pudo cargar el pipeline', {
        description: err instanceof Error ? err.message : 'Reintenta en unos segundos.',
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleDragEnd(result: DropResult) {
    if (!result.destination) return
    
    const { source, destination, draggableId } = result
    
    if (source.droppableId === destination.droppableId && source.index === destination.index) {
      return
    }
    
    // Find the deal being moved
    const sourceStage = stages.find(s => s.id === source.droppableId)
    const destStage = stages.find(s => s.id === destination.droppableId)
    
    if (!sourceStage || !destStage) return
    
    const deal = sourceStage.deals[source.index]
    
    // Optimistic update
    const newStages = [...stages]
    const sourceCol = newStages.find(s => s.id === source.droppableId)
    const destCol = newStages.find(s => s.id === destination.droppableId)
    
    if (sourceCol && destCol) {
      sourceCol.deals.splice(source.index, 1)
      destCol.deals.splice(destination.index, 0, { ...deal, stage_id: destination.droppableId })
      setStages(newStages)
    }
    
    // Update in database
    const { error } = await (supabase
      .from('deals')
      .update({
        stage_id: destination.droppableId,
        probability: destStage.default_probability,
        updated_at: new Date().toISOString()
      })
      .eq('id', draggableId) as any)

    if (error) {
      console.error('Error moving deal:', error)
      toast.error('No se pudo mover el deal', {
        description: error.message || 'Devolviéndolo a su columna original…',
      })
      fetchData() // Revert on error
    } else {
      toast.success(`Movido a "${destStage.name}"`, {
        description: `${deal.name} • ${destStage.probability}% probabilidad`,
      })
    }
  }

  async function createDeal() {
    if (!newDeal.name.trim() || !newDeal.contact_id || !newDeal.stage_id) {
      toast.error('Completa los campos obligatorios')
      return
    }
    const stage = stages.find(s => s.id === newDeal.stage_id)
    try {
      const { error } = await supabase
        .from('deals')
        .insert({
          name: newDeal.name,
          contact_id: newDeal.contact_id,
          value: parseFloat(newDeal.value) || 0,
          stage_id: newDeal.stage_id,
          expected_close_date: newDeal.expected_close_date || null,
          description: newDeal.description,
          probability: stage?.default_probability || 0,
          status: 'open'
        } as any)

      if (error) throw error

      toast.success('Deal creado', {
        description: `${newDeal.name} en "${stage?.name}"`,
      })
      setIsCreateDialogOpen(false)
      setNewDeal({ name: '', contact_id: '', value: '', stage_id: '', expected_close_date: '', description: '' })
      fetchData()
    } catch (err) {
      console.error('Error creating deal:', err)
      toast.error('No se pudo crear el deal', {
        description: err instanceof Error ? err.message : 'Revisa los datos e intenta de nuevo.',
      })
    }
  }

  const filteredStages = stages.map(stage => ({
    ...stage,
    deals: stage.deals.filter(deal => 
      deal.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      deal.contact_first_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      deal.contact_last_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      deal.contact_company?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }))

  const totalValue = stages.reduce((sum, stage) => 
    sum + stage.deals.reduce((dealSum, deal) => dealSum + (deal.value || 0), 0), 0
  )

  const weightedValue = stages.reduce((sum, stage) => 
    sum + stage.deals.reduce((dealSum, deal) => 
      dealSum + ((deal.value || 0) * (deal.probability || 0) / 100), 0
    ), 0
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Pipeline de Ventas</h1>
          <p className="text-zinc-400 mt-1">Gestiona tus oportunidades comerciales</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="border-zinc-700 text-zinc-300">
            <Filter className="h-4 w-4 mr-2" />
            Filtros
          </Button>
          <Button 
            className="bg-white text-black hover:bg-zinc-200"
            onClick={() => setIsCreateDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Deal
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-zinc-400 text-sm">
              <Kanban className="h-4 w-4" />
              Deals Abiertos
            </div>
            <p className="text-2xl font-bold text-white mt-1">
              {stages.reduce((sum, s) => sum + s.deals.length, 0)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-zinc-400 text-sm">
              <DollarSign className="h-4 w-4" />
              Valor Total
            </div>
            <p className="text-2xl font-bold text-white mt-1">
              ${totalValue.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-zinc-400 text-sm">
              <TrendingUp className="h-4 w-4" />
              Valor Ponderado
            </div>
            <p className="text-2xl font-bold text-white mt-1">
              ${Math.round(weightedValue).toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-zinc-400 text-sm">
              <Calendar className="h-4 w-4" />
              Cierre Promedio
            </div>
            <p className="text-2xl font-bold text-white mt-1">
              {stages.length > 0 ? '45 días' : '-'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
        <Input
          placeholder="Buscar deals..."
          className="pl-10 bg-zinc-900 border-zinc-800 text-white"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Kanban Board */}
      {loading ? (
        <div className="flex items-center justify-center h-96">
          <p className="text-zinc-500">Cargando pipeline...</p>
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          {/* Mobile hint: tells the user the kanban scrolls horizontally
              (otherwise users see only 1 column and assume that's all). */}
          <p className="md:hidden text-xs text-zinc-500 mb-2 flex items-center gap-1">
            <span>← Desliza →</span>
            <span className="text-zinc-700">para ver más etapas</span>
          </p>
          <div className="flex gap-3 md:gap-4 overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory md:snap-none">
            {filteredStages.map((stage) => (
              <div
                key={stage.id}
                className="flex-shrink-0 w-[85vw] sm:w-72 md:w-80 snap-start"
              >
                <Card className="bg-zinc-950 border-zinc-800">
                  <CardHeader className="p-3 pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: stage.color }}
                        />
                        <CardTitle className="text-sm font-medium text-white">
                          {stage.name}
                        </CardTitle>
                      </div>
                      <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs">
                        {stage.deals.length}
                      </Badge>
                    </div>
                    <div className="text-xs text-zinc-500 mt-1">
                      ${stage.deals.reduce((sum, d) => sum + (d.value || 0), 0).toLocaleString()} • {stage.probability}%
                    </div>
                  </CardHeader>
                  
                  <Droppable droppableId={stage.id}>
                    {(provided, snapshot) => (
                      <CardContent 
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`p-3 pt-0 space-y-3 min-h-[200px] transition-colors ${
                          snapshot.isDraggingOver ? 'bg-zinc-900/50' : ''
                        }`}
                      >
                        {stage.deals.map((deal, index) => (
                          <Draggable key={deal.id} draggableId={deal.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`p-3 rounded-lg border transition-all cursor-pointer ${
                                  snapshot.isDragging 
                                    ? 'border-white/30 bg-zinc-800 shadow-lg' 
                                    : 'border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900'
                                }`}
                                onClick={() => router.push(`/dashboard/deals/${deal.id}`)}
                              >
                                <div className="flex items-start justify-between mb-2">
                                  <h3 className="font-medium text-white text-sm line-clamp-2">
                                    {deal.name}
                                  </h3>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-6 w-6 -mr-1 -mt-1 text-zinc-500 hover:text-white"
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </div>
                                
                                <div className="flex items-center gap-2 text-xs text-zinc-400 mb-2">
                                  <User className="h-3 w-3" />
                                  <span className="truncate">
                                    {deal.contact_first_name} {deal.contact_last_name}
                                  </span>
                                </div>
                                
                                {deal.contact_company && (
                                  <div className="text-xs text-zinc-500 mb-2">
                                    {deal.contact_company}
                                  </div>
                                )}
                                
                                <div className="flex items-center justify-between pt-2 border-t border-zinc-800/50">
                                  <span className="font-semibold text-white text-sm">
                                    ${deal.value?.toLocaleString()}
                                  </span>
                                  {deal.expected_close_date && (
                                    <span className="text-xs text-zinc-500">
                                      {format(new Date(deal.expected_close_date), 'dd MMM', { locale: es })}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </CardContent>
                    )}
                  </Droppable>
                </Card>
              </div>
            ))}
          </div>
        </DragDropContext>
      )}

      {/* Create Deal Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>Crear Nuevo Deal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Nombre del Deal</label>
              <Input
                className="bg-zinc-900 border-zinc-800 text-white"
                value={newDeal.name}
                onChange={(e) => setNewDeal({...newDeal, name: e.target.value})}
                placeholder="Ej: Rediseño de marca - Empresa XYZ"
              />
            </div>
            
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Contacto</label>
              <Select 
                value={newDeal.contact_id} 
                onValueChange={(value) => setNewDeal({...newDeal, contact_id: value})}
              >
                <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white">
                  <SelectValue placeholder="Seleccionar contacto..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  {contacts.map(contact => (
                    <SelectItem 
                      key={contact.id} 
                      value={contact.id}
                      className="text-white focus:bg-zinc-800"
                    >
                      {contact.first_name} {contact.last_name} {contact.company_name && `- ${contact.company_name}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Valor ($)</label>
                <Input
                  type="number"
                  className="bg-zinc-900 border-zinc-800 text-white"
                  value={newDeal.value}
                  onChange={(e) => setNewDeal({...newDeal, value: e.target.value})}
                  placeholder="5000"
                />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Etapa</label>
                <Select 
                  value={newDeal.stage_id} 
                  onValueChange={(value) => setNewDeal({...newDeal, stage_id: value})}
                >
                  <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white">
                    <SelectValue placeholder="Seleccionar etapa..." />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {stages.map(stage => (
                      <SelectItem 
                        key={stage.id} 
                        value={stage.id}
                        className="text-white focus:bg-zinc-800"
                      >
                        {stage.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Fecha Estimada de Cierre</label>
              <Input
                type="date"
                className="bg-zinc-900 border-zinc-800 text-white"
                value={newDeal.expected_close_date}
                onChange={(e) => setNewDeal({...newDeal, expected_close_date: e.target.value})}
              />
            </div>
            
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Descripción</label>
              <textarea
                className="w-full bg-zinc-900 border border-zinc-800 rounded-md p-2 text-white text-sm"
                rows={3}
                value={newDeal.description}
                onChange={(e) => setNewDeal({...newDeal, description: e.target.value})}
                placeholder="Detalles del proyecto..."
              />
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
                onClick={createDeal}
                disabled={!newDeal.name || !newDeal.contact_id || !newDeal.stage_id}
              >
                Crear Deal
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
