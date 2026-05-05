'use client'

import { useState, useEffect } from 'react'
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { 
  Plus, 
  Key, 
  Copy, 
  Trash2, 
  MoreVertical, 
  Eye, 
  EyeOff,
  Check,
  AlertTriangle,
  Clock
} from 'lucide-react'
import type { ApiKey, ApiRequestLog } from '@/types/api-marketplace'

const AVAILABLE_SCOPES = [
  { id: 'read:contacts', label: 'Leer Contactos', description: 'Acceso de solo lectura a contactos' },
  { id: 'write:contacts', label: 'Escribir Contactos', description: 'Crear y editar contactos' },
  { id: 'read:deals', label: 'Leer Deals', description: 'Acceso de solo lectura a deals' },
  { id: 'write:deals', label: 'Escribir Deals', description: 'Crear y editar deals' },
  { id: 'read:projects', label: 'Leer Proyectos', description: 'Acceso de solo lectura a proyectos' },
  { id: 'write:projects', label: 'Escribir Proyectos', description: 'Crear y editar proyectos' },
  { id: 'read:invoices', label: 'Leer Facturas', description: 'Acceso de solo lectura a facturas' },
  { id: 'write:invoices', label: 'Escribir Facturas', description: 'Crear y editar facturas' },
  { id: 'read:analytics', label: 'Leer Analytics', description: 'Acceso a métricas y reportes' },
  { id: 'webhooks', label: 'Webhooks', description: 'Configurar webhooks' },
  { id: 'admin:*', label: 'Admin Completo', description: 'Acceso total a todas las APIs' },
]

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [logs, setLogs] = useState<ApiRequestLog[]>([])
  const [loading, setLoading] = useState(true)
  
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['read:contacts'])
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null)
  const [showNewKey, setShowNewKey] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    
    const { data: keysData } = await supabase
      .from('api_keys')
      .select('*')
      .order('created_at', { ascending: false })
    
    const { data: logsData } = await supabase
      .from('api_request_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    
    if (keysData) setApiKeys(keysData as ApiKey[])
    if (logsData) setLogs(logsData as ApiRequestLog[])
    setLoading(false)
  }

  async function createApiKey() {
    // Generate a random key (format: crm_live_ + random)
    const prefix = 'crm_live_'
    const randomPart = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    const fullKey = prefix + randomPart
    
    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        name: newKeyName,
        key_hash: fullKey, // En producción esto debería hashearse
        key_prefix: fullKey.substring(0, 8),
        scopes: selectedScopes,
        is_active: true,
        rate_limit_per_minute: 60,
        rate_limit_per_hour: 1000,
        rate_limit_per_day: 10000
      } as any)
      .select()
      .single()
    
    if (!error && data) {
      setNewKeyValue(fullKey)
      setShowNewKey(true)
      setNewKeyName('')
      setSelectedScopes(['read:contacts'])
      fetchData()
    }
  }

  async function revokeKey(id: string) {
    await supabase
      .from('api_keys')
      .update({ is_active: false })
      .eq('id', id)
    
    fetchData()
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">API Keys</h1>
          <p className="text-zinc-400 mt-1">Gestiona claves de acceso a la API REST</p>
        </div>
        <Button 
          className="bg-white text-black hover:bg-zinc-200"
          onClick={() => {
            setNewKeyValue(null)
            setShowNewKey(false)
            setIsCreateDialogOpen(true)
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Nueva API Key
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-sm text-zinc-400">API Keys Activas</div>
            <p className="text-2xl font-bold text-white">
              {apiKeys.filter(k => k.is_active).length}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-sm text-zinc-400">Requests Hoy</div>
            <p className="text-2xl font-bold text-white">
              {logs.filter(l => new Date(l.created_at).toDateString() === new Date().toDateString()).length}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-sm text-zinc-400">Success Rate</div>
            <p className="text-2xl font-bold text-green-400">
              {logs.length > 0 
                ? Math.round((logs.filter(l => l.status_code && l.status_code < 400).length / logs.length) * 100)
                : 0}%
            </p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-sm text-zinc-400">Avg Response Time</div>
            <p className="text-2xl font-bold text-white">
              {logs.length > 0 
                ? Math.round(logs.reduce((sum, l) => sum + (l.response_time_ms || 0), 0) / logs.length)
                : 0}ms
            </p>
          </CardContent>
        </Card>
      </div>

      {/* API Keys List */}
      <Card className="bg-zinc-950 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Claves de API</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-zinc-500">Cargando...</div>
          ) : apiKeys.length === 0 ? (
            <div className="p-8 text-center">
              <Key className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
              <p className="text-zinc-500">No hay API keys</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800">
                  <TableHead className="text-zinc-400">Nombre</TableHead>
                  <TableHead className="text-zinc-400">Key</TableHead>
                  <TableHead className="text-zinc-400">Scopes</TableHead>
                  <TableHead className="text-zinc-400">Último Uso</TableHead>
                  <TableHead className="text-zinc-400">Estado</TableHead>
                  <TableHead className="text-zinc-400">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys.map((key) => (
                  <TableRow key={key.id} className="border-zinc-800">
                    <TableCell className="text-white font-medium">
                      {key.name}
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-zinc-900 px-2 py-1 rounded text-zinc-400">
                        {key.key_prefix}••••••••••••••••
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {key.scopes?.slice(0, 2).map(scope => (
                          <Badge key={scope} variant="outline" className="text-xs border-zinc-700 text-zinc-400">
                            {scope}
                          </Badge>
                        ))}
                        {(key.scopes?.length || 0) > 2 && (
                          <Badge variant="outline" className="text-xs border-zinc-700 text-zinc-400">
                            +{(key.scopes?.length || 0) - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-zinc-400">
                      {key.last_used_at 
                        ? format(new Date(key.last_used_at), 'dd MMM HH:mm', { locale: es })
                        : 'Nunca'
                      }
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={key.is_active 
                          ? 'border-green-500 text-green-400' 
                          : 'border-red-500 text-red-400'
                        }
                      >
                        {key.is_active ? 'Activa' : 'Revocada'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                          {key.is_active && (
                            <DropdownMenuItem 
                              className="text-red-400"
                              onClick={() => revokeKey(key.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Revocar
                            </DropdownMenuItem>
                          )}
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

      {/* Request Logs */}
      <Card className="bg-zinc-950 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Últimos Requests</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <div className="p-8 text-center text-zinc-500">No hay logs recientes</div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {logs.slice(0, 10).map((log) => (
                <div key={log.id} className="p-4 flex items-center justify-between hover:bg-zinc-900/50">
                  <div className="flex items-center gap-3">
                    <Badge 
                      variant="outline" 
                      className={
                        log.status_code && log.status_code < 400
                          ? 'border-green-500 text-green-400'
                          : 'border-red-500 text-red-400'
                      }
                    >
                      {log.method}
                    </Badge>
                    <div>
                      <p className="text-white text-sm">{log.path}</p>
                      <p className="text-zinc-500 text-xs">
                        {format(new Date(log.created_at), 'dd MMM HH:mm:ss', { locale: es })}
                        {log.response_time_ms && ` • ${log.response_time_ms}ms`}
                      </p>
                    </div>
                  </div>
                  {log.status_code && (
                    <Badge 
                      variant="outline" 
                      className={
                        log.status_code < 400
                          ? 'border-green-500 text-green-400'
                          : log.status_code < 500
                          ? 'border-yellow-500 text-yellow-400'
                          : 'border-red-500 text-red-400'
                      }
                    >
                      {log.status_code}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {showNewKey ? 'API Key Creada' : 'Crear Nueva API Key'}
            </DialogTitle>
          </DialogHeader>
          
          {showNewKey ? (
            <div className="space-y-4 mt-4">
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-yellow-400">¡Guarda esta key!</h4>
                    <p className="text-sm text-zinc-400 mt-1">
                      Solo se mostrará una vez. No podrás verla nuevamente.
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="bg-zinc-900 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <code className="text-sm text-white break-all">
                    {newKeyValue}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-zinc-400"
                    onClick={() => newKeyValue && copyToClipboard(newKeyValue)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <Button 
                className="w-full bg-white text-black hover:bg-zinc-200"
                onClick={() => {
                  setIsCreateDialogOpen(false)
                  setShowNewKey(false)
                  setNewKeyValue(null)
                }}
              >
                <Check className="h-4 w-4 mr-2" />
                He guardado la key
              </Button>
            </div>
          ) : (
            <div className="space-y-4 mt-4">
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Nombre *</label>
                <Input
                  placeholder="Ej: Integración Stripe"
                  className="bg-zinc-900 border-zinc-800 text-white"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                />
              </div>
              
              <div>
                <label className="text-sm text-zinc-400 mb-3 block">Permisos (Scopes)</label>
                <div className="grid gap-2 max-h-64 overflow-y-auto">
                  {AVAILABLE_SCOPES.map((scope) => (
                    <div key={scope.id} className="flex items-start gap-3 p-2 hover:bg-zinc-900 rounded">
                      <Checkbox
                        checked={selectedScopes.includes(scope.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedScopes([...selectedScopes, scope.id])
                          } else {
                            setSelectedScopes(selectedScopes.filter(s => s !== scope.id))
                          }
                        }}
                        className="mt-1"
                      />
                      <div>
                        <p className="text-white text-sm">{scope.label}</p>
                        <p className="text-zinc-500 text-xs">{scope.description}</p>
                      </div>
                    </div>
                  ))}
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
                  onClick={createApiKey}
                  disabled={!newKeyName.trim() || selectedScopes.length === 0}
                >
                  Crear API Key
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
