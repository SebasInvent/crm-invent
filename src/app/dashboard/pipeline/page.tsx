'use client'

import { useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
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
  useSupabaseQuery,
  useSupabaseMutation,
  queryKeys,
} from '@/lib/hooks/useSupabaseQuery'
import { ProductPicker } from '@/components/products/ProductPicker'
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

type NewDealForm = {
  name: string
  contact_id: string
  value: string
  stage_id: string
  expected_close_date: string
  description: string
}

const emptyDealForm: NewDealForm = {
  name: '',
  contact_id: '',
  value: '',
  stage_id: '',
  expected_close_date: '',
  description: '',
}

export default function PipelinePage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const productSlug = searchParams.get('product') ?? ''
  const [searchQuery, setSearchQuery] = useState('')
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [newDeal, setNewDeal] = useState<NewDealForm>(emptyDealForm)

  // ─── 1. Resolve the selected product → its default pipeline_id +
  //     stages. The kanban now filters strictly by pipeline so each
  //     vertical (Foody, Veralix, Dental OS, etc.) shows only its own
  //     funnel.
  const { data: productMeta } = useSupabaseQuery<{
    pipeline_id: string | null
    product_id: string | null
    color: string | null
  }>({
    queryKey: ['pipeline', 'product-meta', productSlug],
    queryFn: async () => {
      // Need to fetch via /api/products/[slug] for the joined
      // pipeline + stages. We wrap that fetch in the supabase-shaped
      // tuple so the existing useSupabaseQuery wrapper accepts it.
      const res = await fetch(`/api/products/${productSlug}`)
      if (!res.ok) {
        return { data: null, error: { message: `HTTP ${res.status}` } }
      }
      const json = await res.json()
      const defaultPipeline =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((json.pipelines as any[]) || []).find((p) => p.is_default) ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((json.pipelines as any[]) || [])[0]
      return {
        data: {
          pipeline_id: defaultPipeline?.id ?? null,
          product_id: json.product?.id ?? null,
          color: json.product?.color ?? null,
        },
        error: null,
      }
    },
    enabled: !!productSlug,
    staleTime: 5 * 60_000,
  })

  const pipelineId = productMeta?.pipeline_id ?? null
  const productId = productMeta?.product_id ?? null

  // ─── 2. Stages for the selected pipeline only.
  const { data: stagesData = [], isLoading: stagesLoading } = useSupabaseQuery<PipelineStage[]>({
    queryKey: ['pipeline', 'stages', pipelineId],
    queryFn: () =>
      supabase
        .from('pipeline_stages')
        .select('*')
        .eq('is_active', true)
        .eq('pipeline_id', pipelineId!)
        .order('order_index') as unknown as Promise<{ data: PipelineStage[] | null; error: { message: string } | null }>,
    enabled: !!pipelineId,
    staleTime: 5 * 60_000,
  })

  // ─── 3. Deals scoped to this product only.
  const { data: dealsData = [], isLoading: dealsLoading } = useSupabaseQuery<Deal[]>({
    queryKey: ['pipeline', 'deals', productId],
    queryFn: () =>
      supabase
        .from('deals_full')
        .select('*')
        .eq('status', 'open')
        .eq('product_id', productId!)
        .order('updated_at', { ascending: false }) as unknown as Promise<{ data: Deal[] | null; error: { message: string } | null }>,
    enabled: !!productId,
  })

  const { data: contacts = [] } = useSupabaseQuery<Contact[]>({
    queryKey: queryKeys.pipeline.contacts,
    queryFn: () =>
      supabase
        .from('contacts')
        .select('id, first_name, last_name, email, company_name')
        .eq('status', 'active')
        .order('first_name') as unknown as Promise<{ data: Contact[] | null; error: { message: string } | null }>,
    staleTime: 5 * 60_000,
  })

  const loading = stagesLoading || dealsLoading

  // ─── Stages with their deals composed in memory. Memoized so dragging
  //     doesn't recompute the whole structure on every render.
  const stages = useMemo<KanbanColumnData[]>(
    () =>
      stagesData.map((stage) => ({
        id: stage.id,
        name: stage.name,
        color: stage.color,
        order_index: stage.order_index,
        probability: stage.default_probability,
        deals: dealsData.filter((d) => d.stage_id === stage.id),
      })),
    [stagesData, dealsData],
  )

  // ─── Drag mutation. Goes through /api/deals/[id] PATCH so we get
  //     server-side validation, auth, and an automatic activity_logs
  //     entry (deal_moved). The cache is mutated optimistically before
  //     the request fires so the kanban repaints instantly; if the
  //     PATCH fails we invalidate to roll back.
  const moveDealMutation = useSupabaseMutation<
    { dealId: string; toStageId: string; toProbability: number; toStageName: string; dealName: string },
    void
  >({
    mutationFn: async ({ dealId, toStageId, toProbability }) => {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage_id: toStageId,
          probability: toProbability,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
    },
    invalidateKeys: [queryKeys.pipeline.deals],
    successMessage: ({}, input) =>
      `Movido a "${input.toStageName}" • ${input.toProbability}%`,
    errorMessage: 'No se pudo mover el deal',
  })

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return
    const { source, destination, draggableId } = result
    if (source.droppableId === destination.droppableId && source.index === destination.index) return

    const sourceStage = stages.find((s) => s.id === source.droppableId)
    const destStage = stages.find((s) => s.id === destination.droppableId)
    if (!sourceStage || !destStage) return

    const deal = sourceStage.deals[source.index]
    if (!deal) return

    // Optimistic cache update — repaint the kanban immediately.
    // OJO: la query real usa ['pipeline','deals',productId]; setQueryData exige
    // match EXACTO del key — con el key corto la tarjeta "rebotaba" a su columna.
    queryClient.setQueryData<Deal[]>(['pipeline', 'deals', productId], (prev) =>
      prev?.map((d) =>
        d.id === draggableId
          ? { ...d, stage_id: destination.droppableId, probability: destStage.probability }
          : d,
      ) ?? prev,
    )

    moveDealMutation.mutate({
      dealId: draggableId,
      toStageId: destination.droppableId,
      toProbability: destStage.probability,
      toStageName: destStage.name,
      dealName: deal.name,
    })
  }

  // ─── Create deal mutation. Goes through /api/deals POST for
  //     server-side validation + automatic deal_created activity log.
  const createDealMutation = useSupabaseMutation<NewDealForm, void>({
    mutationFn: async (input) => {
      const stage = stages.find((s) => s.id === input.stage_id)
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: input.name,
          contact_id: input.contact_id,
          value: parseFloat(input.value) || 0,
          stage_id: input.stage_id,
          pipeline_id: pipelineId,    // scope new deal to current pipeline
          product_id: productId,      // tag with current product
          expected_close_date: input.expected_close_date || null,
          description: input.description || null,
          probability: stage?.probability || 0,
          status: 'open',
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
    },
    invalidateKeys: [queryKeys.pipeline.deals],
    successMessage: (_, input) => {
      const stage = stages.find((s) => s.id === input.stage_id)
      return `Deal creado: ${input.name} en "${stage?.name ?? '—'}"`
    },
    errorMessage: 'No se pudo crear el deal',
    onSuccess: () => {
      setIsCreateDialogOpen(false)
      setNewDeal(emptyDealForm)
    },
  })

  function createDeal() {
    if (!newDeal.name.trim() || !newDeal.contact_id || !newDeal.stage_id) {
      toast.error('Completa los campos obligatorios')
      return
    }
    createDealMutation.mutate(newDeal)
  }

  const filteredStages = stages.map((stage) => ({
    ...stage,
    deals: stage.deals.filter(
      (deal) =>
        deal.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        deal.contact_first_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        deal.contact_last_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        deal.contact_company?.toLowerCase().includes(searchQuery.toLowerCase()),
    ),
  }))

  const totalValue = stages.reduce(
    (sum, stage) => sum + stage.deals.reduce((dealSum, deal) => dealSum + (deal.value || 0), 0),
    0,
  )

  const weightedValue = stages.reduce(
    (sum, stage) =>
      sum +
      stage.deals.reduce(
        (dealSum, deal) => dealSum + ((deal.value || 0) * (deal.probability || 0)) / 100,
        0,
      ),
    0,
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white">Pipeline de Ventas</h1>
          <p className="text-zinc-400 mt-1">
            Filtrado por producto. Cada vertical tiene su propio embudo.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="border-zinc-700 text-zinc-300">
            <Filter className="h-4 w-4 mr-2" />
            Filtros
          </Button>
          <Button
            className="bg-white text-black hover:bg-zinc-200"
            onClick={() => setIsCreateDialogOpen(true)}
            disabled={!productId}
            title={!productId ? 'Selecciona un producto primero' : undefined}
          >
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Deal
          </Button>
        </div>
      </div>

      {/* Product picker — chips for each vertical */}
      <ProductPicker />

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
                disabled={
                  !newDeal.name ||
                  !newDeal.contact_id ||
                  !newDeal.stage_id ||
                  createDealMutation.isPending
                }
              >
                {createDealMutation.isPending ? 'Creando…' : 'Crear Deal'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
