export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import { LeadFilters } from '@/components/leads/LeadFilters'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Users,
  Plus,
  Target,
  Flame,
  Thermometer,
  Snowflake,
  Skull,
  CheckCircle,
  Brain,
  TrendingUp,
  Building2,
  Mail,
  Phone,
  Globe,
  Calendar,
  ArrowRight,
} from 'lucide-react'
import type { Lead } from '@/types/database'

// Type assertion para los resultados de Supabase
interface LeadStats {
  lead_status: Lead['lead_status'];
  jung_archetype: Lead['jung_archetype'];
}

const archetypeLabels: Record<string, { label: string; color: string; icon: string }> = {
  hero_entrepreneur: { label: 'Emprendedor Visionario', color: 'bg-orange-100 text-orange-800', icon: '🚀' },
  sage_conservative: { label: 'Empresario Conservador', color: 'bg-blue-100 text-blue-800', icon: '🛡️' },
  caregiver_stressed: { label: 'Marketing Manager', color: 'bg-purple-100 text-purple-800', icon: '💆' },
  artist_specialist: { label: 'Especialista Independiente', color: 'bg-pink-100 text-pink-800', icon: '🎨' },
  ruler_executive: { label: 'Ejecutivo Results-Driven', color: 'bg-emerald-100 text-emerald-800', icon: '👑' },
  explorer_merchant: { label: 'Comerciante Digital', color: 'bg-cyan-100 text-cyan-800', icon: '🛍️' }
}

const statusConfig = {
  hot: { label: 'Hot', color: 'bg-red-100 text-red-800 border-red-200', icon: Flame },
  warm: { label: 'Warm', color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: Thermometer },
  cold: { label: 'Cold', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: Snowflake },
  dead: { label: 'Dead', color: 'bg-gray-100 text-gray-800 border-gray-200', icon: Skull },
  converted: { label: 'Cliente', color: 'bg-green-100 text-green-800 border-green-200', icon: CheckCircle }
}

const priorityConfig = {
  critical: 'bg-red-500 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-white',
  low: 'bg-gray-500 text-white'
}

interface LeadFilters {
  status?: string
  archetype?: string
  q?: string
}

async function getLeads(filters: LeadFilters = {}): Promise<Lead[]> {
  let query = supabase
    .from('leads')
    .select('*')
    .order('lead_score', { ascending: false })
    .limit(50)

  if (filters.status) query = query.eq('lead_status', filters.status)
  if (filters.archetype) query = query.eq('jung_archetype', filters.archetype)
  if (filters.q) {
    // Search across name, email, company (tablename ilike or)
    const term = filters.q.replace(/[%]/g, '')
    query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%,company.ilike.%${term}%`)
  }

  const { data: leads, error } = await query
  if (error) {
    console.error('Error fetching leads:', error)
    return []
  }
  return (leads as Lead[]) || []
}

async function getLeadStats() {
  const { data: stats } = await supabase
    .from('leads')
    .select('lead_status, jung_archetype')

  const leadsData = (stats as LeadStats[]) || []
  
  const totals = {
    total: leadsData.length,
    hot: leadsData.filter((l: LeadStats) => l.lead_status === 'hot').length,
    warm: leadsData.filter((l: LeadStats) => l.lead_status === 'warm').length,
    cold: leadsData.filter((l: LeadStats) => l.lead_status === 'cold').length,
    converted: leadsData.filter((l: LeadStats) => l.lead_status === 'converted').length,
    byArchetype: {} as Record<string, number>
  }

  leadsData.forEach((lead: LeadStats) => {
    if (lead.jung_archetype) {
      totals.byArchetype[lead.jung_archetype] = (totals.byArchetype[lead.jung_archetype] || 0) + 1
    }
  })

  return totals
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const pickStr = (v: string | string[] | undefined) =>
    typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined

  const filters = {
    status: pickStr(sp.status),
    archetype: pickStr(sp.archetype),
    q: pickStr(sp.q),
  }

  const leads = await getLeads(filters)
  const stats = await getLeadStats()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Target className="h-8 w-8 text-primary" />
            Leads & Prospección
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestiona prospectos basados en la metodología Jung
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/leads/scrape">
            <Button variant="outline">
              <Globe className="h-4 w-4 mr-2" />
              Scraper
            </Button>
          </Link>
          <Link href="/dashboard/leads/import">
            <Button variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Importar
            </Button>
          </Link>
          <Link href="/dashboard/leads/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Lead
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">En pipeline</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hot Leads</CardTitle>
            <Flame className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.hot}</div>
            <p className="text-xs text-muted-foreground">Contactar en 24h</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Convertidos</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.converted}</div>
            <p className="text-xs text-muted-foreground">Clientes nuevos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Con Arquetipo</CardTitle>
            <Brain className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {Object.values(stats.byArchetype).reduce((a, b) => a + b, 0)}
            </div>
            <p className="text-xs text-muted-foreground">Perfiles Jung identificados</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Search — wired to URL params via client component */}
      <LeadFilters archetypeLabels={archetypeLabels} />

      {/* Leads Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Pipeline de Leads
          </CardTitle>
        </CardHeader>
        <CardContent>
          {leads.length === 0 ? (
            <EmptyState
              icon={Target}
              title="Aún no hay leads"
              description="Comienza agregando leads manualmente o lanza el Scraper para encontrar prospectos automáticamente."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Link href="/dashboard/leads/scrape">
                    <Button variant="outline">
                      <Globe className="h-4 w-4 mr-2" />
                      Ir al Scraper
                    </Button>
                  </Link>
                  <Link href="/dashboard/leads/new">
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Agregar Lead
                    </Button>
                  </Link>
                </div>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Lead</th>
                    <th className="text-left py-3 px-4 font-medium">Arquetipo</th>
                    <th className="text-left py-3 px-4 font-medium">Score</th>
                    <th className="text-left py-3 px-4 font-medium">Estado</th>
                    <th className="text-left py-3 px-4 font-medium">Prioridad</th>
                    <th className="text-left py-3 px-4 font-medium">Próximo Contacto</th>
                    <th className="text-left py-3 px-4 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => {
                    const StatusIcon = statusConfig[lead.lead_status as keyof typeof statusConfig]?.icon || Snowflake
                    const archetype = lead.jung_archetype ? archetypeLabels[lead.jung_archetype] : null
                    
                    return (
                      <tr key={lead.id} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-semibold">
                              {lead.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium">{lead.name}</p>
                              <p className="text-sm text-muted-foreground">{lead.company}</p>
                              {lead.industry && (
                                <Badge variant="outline" className="text-xs mt-1">
                                  {lead.industry}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {archetype ? (
                            <Badge className={archetype.color}>
                              <span className="mr-1">{archetype.icon}</span>
                              {archetype.label}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-primary h-2 rounded-full" 
                                style={{ width: `${lead.lead_score}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium">{lead.lead_score}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge 
                            variant="outline" 
                            className={statusConfig[lead.lead_status as keyof typeof statusConfig]?.color}
                          >
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusConfig[lead.lead_status as keyof typeof statusConfig]?.label}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          <Badge className={priorityConfig[lead.priority as keyof typeof priorityConfig]}>
                            {lead.priority}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          {lead.next_follow_up_date ? (
                            <div className="flex items-center gap-1 text-sm">
                              <Calendar className="h-4 w-4" />
                              {new Date(lead.next_follow_up_date).toLocaleDateString('es-CO')}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex gap-1">
                            <Link href={`/dashboard/leads/${lead.id}`}>
                              <Button variant="ghost" size="sm">
                                Ver
                                <ArrowRight className="h-4 w-4 ml-1" />
                              </Button>
                            </Link>
                            {lead.email && (
                              <a href={`mailto:${lead.email}`}>
                                <Button variant="ghost" size="icon">
                                  <Mail className="h-4 w-4" />
                                </Button>
                              </a>
                            )}
                            {lead.phone && (
                              <a href={`tel:${lead.phone}`}>
                                <Button variant="ghost" size="icon">
                                  <Phone className="h-4 w-4" />
                                </Button>
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Arquetypes Legend */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4" />
            Guía de Arquetipos Jung
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
            {Object.entries(archetypeLabels).map(([key, { label, icon }]) => (
              <div key={key} className="flex items-center gap-1">
                <span>{icon}</span>
                <span className="text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
