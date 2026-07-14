'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { 
  Plus, 
  Search, 
  MoreVertical, 
  ExternalLink, 
  Check, 
  X, 
  Settings,
  Zap,
  CreditCard,
  Mail,
  Calendar,
  HardDrive,
  Share2,
  MessageSquare,
  BarChart,
  Users,
  Calculator,
  Puzzle,
  Copy,
  Trash2,
  RefreshCw
} from 'lucide-react'
import type { Integration, IntegrationInstall } from '@/types/api-marketplace'

const CATEGORY_ICONS: Record<string, any> = {
  communication: MessageSquare,
  email: Mail,
  calendar: Calendar,
  payment: CreditCard,
  accounting: Calculator,
  storage: HardDrive,
  social: Share2,
  automation: Zap,
  analytics: BarChart,
  crm: Users,
  custom: Puzzle
}

export default function IntegrationsPage() {
  const router = useRouter()
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [installed, setInstalled] = useState<IntegrationInstall[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  
  const [isInstallDialogOpen, setIsInstallDialogOpen] = useState(false)
  const [reconfigInstallId, setReconfigInstallId] = useState<string | null>(null)
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null)
  const [configValues, setConfigValues] = useState<Record<string, any>>({})

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    
    // Cast a any: el cliente no tiene tipos generados para estas tablas
    // (mismo patrón que las rutas API). `nullsFirst: false` = NULLS LAST
    // (supabase-js v2 no tiene opción `nullsLast`).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: integrationsData } = await (supabase.from('integrations') as any)
      .select('*')
      .eq('status', 'active')
      .order('featured_order', { ascending: true, nullsFirst: false })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: installedData } = await (supabase.from('integration_installs') as any)
      .select('*, integration:integration_id(name, provider_logo_url)')
      .neq('status', 'uninstalled')

    if (integrationsData) {
      // Mark installed integrations
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const installedIds = new Set((installedData as any[] | null)?.map(i => i.integration_id) || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setIntegrations((integrationsData as any[]).map(int => ({
        ...int,
        is_installed: installedIds.has(int.id)
      })) as Integration[])
    }
    
    if (installedData) setInstalled(installedData as IntegrationInstall[])
    setLoading(false)
  }

  async function installIntegration(integration: Integration) {
    setSelectedIntegration(integration)
    setConfigValues({})
    setReconfigInstallId(null)
    setIsInstallDialogOpen(true)
  }

  /** "Configurar" reutiliza el mismo diálogo, prellenado, y hace UPDATE.
   *  (Antes navegaba a /dashboard/integrations/[id], ruta inexistente → 404.) */
  function configureIntegration(integration: Integration) {
    const install = installed.find(
      (i) => i.integration_id === integration.id && i.status === 'active'
    )
    setSelectedIntegration(integration)
    setConfigValues(((install?.config as Record<string, string>) || {}))
    setReconfigInstallId(install?.id ?? null)
    setIsInstallDialogOpen(true)
  }

  async function confirmInstall() {
    if (!selectedIntegration) return

    // Validar campos requeridos del config antes de guardar
    const missing = (selectedIntegration.config_fields || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((f: any) => f.required && !String(configValues[f.key] ?? '').trim())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((f: any) => f.label || f.key)
    if (missing.length) {
      toast.error(`Completa los campos requeridos: ${missing.join(', ')}`)
      return
    }

    const { error } = reconfigInstallId
      ? await (supabase.from('integration_installs') as any)
          .update({ config: configValues })
          .eq('id', reconfigInstallId)
      : await supabase
          .from('integration_installs')
          .insert({
            integration_id: selectedIntegration.id,
            config: configValues,
            status: 'active'
          } as any)

    if (!error) {
      toast.success(reconfigInstallId ? 'Configuración guardada' : 'Integración instalada')
      setIsInstallDialogOpen(false)
      setReconfigInstallId(null)
      fetchData()
    } else {
      toast.error(`No se pudo guardar: ${error.message}`)
    }
  }

  async function uninstall(installId: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('integration_installs') as any)
      .update({ status: 'uninstalled', uninstalled_at: new Date().toISOString() })
      .eq('id', installId)
    
    fetchData()
  }

  const categories = Array.from(new Set(integrations.map(i => i.category)))

  const filteredIntegrations = integrations.filter(int => {
    const matchesSearch = 
      int.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      int.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      int.provider_name?.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesTab = 
      activeTab === 'all' ? true :
      activeTab === 'installed' ? int.is_installed :
      activeTab === 'featured' ? int.featured_order != null :
      true
    
    const matchesCategory = selectedCategory ? int.category === selectedCategory : true
    
    return matchesSearch && matchesTab && matchesCategory
  })

  const featuredIntegrations = integrations.filter(i => i.featured_order != null).slice(0, 3)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Integraciones</h1>
          <p className="text-zinc-400 mt-1">Conecta tu CRM con herramientas externas</p>
        </div>
        <Button 
          variant="outline" 
          className="border-zinc-700 text-zinc-300"
          onClick={() => router.push('/dashboard/integrations/api')}
        >
          <Settings className="h-4 w-4 mr-2" />
          API Keys
        </Button>
      </div>

      {/* Featured */}
      {featuredIntegrations.length > 0 && activeTab === 'all' && !searchQuery && !selectedCategory && (
        <div className="grid gap-4 md:grid-cols-3">
          {featuredIntegrations.map(integration => {
            const Icon = CATEGORY_ICONS[integration.category] || Puzzle
            return (
              <Card key={integration.id} className="bg-gradient-to-br from-zinc-900 to-zinc-950 border-zinc-800">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {integration.provider_logo_url ? (
                        <img 
                          src={integration.provider_logo_url} 
                          alt={integration.provider_name}
                          className="h-12 w-12 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-lg bg-zinc-800 flex items-center justify-center">
                          <Icon className="h-6 w-6 text-zinc-400" />
                        </div>
                      )}
                      <div>
                        <h3 className="font-semibold text-white">{integration.name}</h3>
                        <p className="text-sm text-zinc-500">{integration.provider_name}</p>
                      </div>
                    </div>
                    {integration.is_installed ? (
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                        <Check className="h-3 w-3 mr-1" />
                        Activo
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-zinc-600 text-zinc-400">
                        Popular
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-zinc-400 mt-3 line-clamp-2">
                    {integration.short_description || integration.description}
                  </p>
                  <Button 
                    className="w-full mt-4 bg-white text-black hover:bg-zinc-200"
                    onClick={() => integration.is_installed ? configureIntegration(integration) : installIntegration(integration)}
                  >
                    {integration.is_installed ? 'Configurar' : 'Instalar'}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Tabs y Filtros */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList className="bg-zinc-900">
            <TabsTrigger value="all" className="data-[state=active]:bg-zinc-800">
              Todas
            </TabsTrigger>
            <TabsTrigger value="installed" className="data-[state=active]:bg-zinc-800">
              Instaladas
            </TabsTrigger>
            <TabsTrigger value="featured" className="data-[state=active]:bg-zinc-800">
              Destacadas
            </TabsTrigger>
          </TabsList>
          
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                placeholder="Buscar integraciones..."
                className="pl-10 w-64 bg-zinc-900 border-zinc-800 text-white"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Categorías */}
        <div className="flex gap-2 flex-wrap mt-4">
          <Button
            size="sm"
            variant={selectedCategory === null ? 'default' : 'outline'}
            className={selectedCategory === null ? 'bg-white text-black' : 'border-zinc-700 text-zinc-400'}
            onClick={() => setSelectedCategory(null)}
          >
            Todas
          </Button>
          {categories.map(cat => {
            const Icon = CATEGORY_ICONS[cat] || Puzzle
            return (
              <Button
                key={cat}
                size="sm"
                variant={selectedCategory === cat ? 'default' : 'outline'}
                className={selectedCategory === cat ? 'bg-white text-black' : 'border-zinc-700 text-zinc-400'}
                onClick={() => setSelectedCategory(cat)}
              >
                <Icon className="h-4 w-4 mr-1" />
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </Button>
            )
          })}
        </div>

        <TabsContent value={activeTab} className="mt-4">
          {loading ? (
            <div className="text-center py-12 text-zinc-500">Cargando...</div>
          ) : filteredIntegrations.length === 0 ? (
            <div className="text-center py-12">
              <Puzzle className="h-16 w-16 text-zinc-600 mx-auto mb-4" />
              <p className="text-zinc-500">No hay integraciones disponibles</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredIntegrations.map(integration => {
                const Icon = CATEGORY_ICONS[integration.category] || Puzzle
                return (
                  <Card key={integration.id} className="bg-zinc-950 border-zinc-800 hover:border-zinc-700 transition-colors">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          {integration.provider_logo_url ? (
                            <img 
                              src={integration.provider_logo_url} 
                              alt={integration.provider_name}
                              className="h-10 w-10 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-lg bg-zinc-800 flex items-center justify-center">
                              <Icon className="h-5 w-5 text-zinc-400" />
                            </div>
                          )}
                          <div>
                            <h3 className="font-medium text-white">{integration.name}</h3>
                            <p className="text-xs text-zinc-500">{integration.provider_name}</p>
                          </div>
                        </div>
                        {integration.is_installed && (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                            Activo
                          </Badge>
                        )}
                      </div>
                      
                      <p className="text-sm text-zinc-400 mt-3 line-clamp-2">
                        {integration.short_description || integration.description}
                      </p>
                      
                      <div className="flex items-center gap-2 mt-3 text-xs text-zinc-500">
                        <Badge variant="outline" className="text-xs border-zinc-700 text-zinc-400">
                          {integration.category}
                        </Badge>
                        {integration.is_free ? (
                          <span className="text-green-400">Gratis</span>
                        ) : (
                          <span>${integration.price_monthly}/mes</span>
                        )}
                      </div>
                      
                      <div className="flex gap-2 mt-4">
                        {integration.is_installed ? (
                          <>
                            <Button 
                              variant="outline"
                              size="sm"
                              className="flex-1 border-zinc-700 text-zinc-300"
                              onClick={() => configureIntegration(integration)}
                            >
                              <Settings className="h-4 w-4 mr-1" />
                              Configurar
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                                <DropdownMenuItem
                                  className="text-white"
                                  disabled={!integration.documentation_url}
                                  onClick={() => integration.documentation_url && window.open(integration.documentation_url, '_blank')}
                                >
                                  <ExternalLink className="h-4 w-4 mr-2" />
                                  Documentación
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-red-400"
                                  onClick={() => {
                                    const inst = installed.find((i) => i.integration_id === integration.id && i.status === 'active')
                                    if (inst) uninstall(inst.id)
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Desinstalar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </>
                        ) : (
                          <Button 
                            size="sm"
                            className="flex-1 bg-white text-black hover:bg-zinc-200"
                            onClick={() => installIntegration(integration)}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Instalar
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Installed Integrations List */}
      {installed.length > 0 && (
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white text-lg">Integraciones Activas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {installed.map(inst => (
                <div key={inst.id} className="flex items-center justify-between p-3 bg-zinc-900 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-zinc-800 flex items-center justify-center">
                      <Zap className="h-5 w-5 text-zinc-400" />
                    </div>
                    <div>
                      <p className="text-white font-medium">{inst.integration?.name || 'Integración'}</p>
                      <p className="text-xs text-zinc-500">
                        Instalada {new Date(inst.installed_at).toLocaleDateString()}
                        {inst.last_sync_at && ` • Última sync: ${new Date(inst.last_sync_at).toLocaleDateString()}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant="outline" 
                      className={
                        inst.status === 'active' 
                          ? 'border-green-500 text-green-400' 
                          : inst.status === 'error'
                          ? 'border-red-500 text-red-400'
                          : 'border-yellow-500 text-yellow-400'
                      }
                    >
                      {inst.status}
                    </Badge>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-zinc-400"
                      onClick={() => uninstall(inst.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Install Dialog */}
      <Dialog open={isInstallDialogOpen} onOpenChange={setIsInstallDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>Instalar {selectedIntegration?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-zinc-400 text-sm">{selectedIntegration?.description}</p>
            
            {selectedIntegration?.config_fields && selectedIntegration.config_fields.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-white">Configuración</h4>
                {selectedIntegration.config_fields.map((field: any) => (
                  <div key={field.name}>
                    <label className="text-sm text-zinc-400 mb-1 block">
                      {field.label}
                      {field.required && <span className="text-red-400 ml-1">*</span>}
                    </label>
                    <Input
                      type={field.type === 'password' ? 'password' : 'text'}
                      className="bg-zinc-900 border-zinc-800 text-white"
                      value={configValues[field.name] || ''}
                      onChange={(e) => setConfigValues({...configValues, [field.name]: e.target.value})}
                      placeholder={field.description}
                    />
                  </div>
                ))}
              </div>
            )}
            
            <div className="flex justify-end gap-3 pt-4">
              <Button 
                variant="outline" 
                className="border-zinc-700 text-zinc-300"
                onClick={() => setIsInstallDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button 
                className="bg-white text-black hover:bg-zinc-200"
                onClick={confirmInstall}
              >
                Instalar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
