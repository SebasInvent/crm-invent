'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase } from '@/lib/supabase'
import { format, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { 
  LineChart, 
  Line, 
  AreaChart, 
  Area,
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts'
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Users, 
  Target, 
  Activity,
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  PieChart as PieChartIcon,
  Activity as ActivityIcon
} from 'lucide-react'
import type { DailyMetric, AutomatedInsight, PipelineAnalytics } from '@/types/analytics'

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']

export default function AnalyticsPage() {
  const [metrics, setMetrics] = useState<DailyMetric[]>([])
  const [insights, setInsights] = useState<AutomatedInsight[]>([])
  const [pipelineStats, setPipelineStats] = useState<PipelineAnalytics[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    fetchData()
  }, [])

  // Recharts: el ResponsiveContainer mide 0px si el gráfico montó dentro de una
  // pestaña oculta (Pipeline/Revenue). Un resize al cambiar de tab lo obliga a
  // recalcular para que la torta/barras se dibujen.
  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 120)
    return () => clearTimeout(t)
  }, [activeTab])

  async function fetchData() {
    setLoading(true)
    
    // Fetch daily metrics (last 30 days)
    const { data: metricsData } = await supabase
      .from('daily_metrics')
      .select('*')
      .gte('date', format(subDays(new Date(), 30), 'yyyy-MM-dd'))
      .order('date', { ascending: true })
    
    // Fetch insights
    const { data: insightsData } = await supabase
      .from('automated_insights')
      .select('*')
      .eq('dismissed', false)
      .order('created_at', { ascending: false })
      .limit(10)
    
    // Fetch pipeline analytics
    const { data: pipelineData } = await supabase
      .from('pipeline_analytics_view')
      .select('*')
      .order('order_index')
    
    if (metricsData) setMetrics(metricsData as DailyMetric[])
    if (insightsData) setInsights(insightsData as AutomatedInsight[])
    if (pipelineData) setPipelineStats(pipelineData as PipelineAnalytics[])
    
    setLoading(false)
  }

  // Calculate stats
  const stats = {
    revenue: metrics.reduce((sum, m) => sum + (m.revenue || 0), 0),
    dealsWon: metrics.reduce((sum, m) => sum + (m.deals_won || 0), 0),
    newContacts: metrics.reduce((sum, m) => sum + (m.new_contacts || 0), 0),
    conversionRate: metrics.length > 0 
      ? (metrics.reduce((sum, m) => sum + (m.converted_leads || 0), 0) / 
         Math.max(metrics.reduce((sum, m) => sum + (m.new_leads || 0), 0), 1) * 100)
      : 0
  }

  function exportReport() {
    const headers = ['Fecha', 'Revenue', 'Deals Ganados', 'Nuevos Contactos', 'Nuevos Leads', 'Mensajes recibidos', 'Mensajes enviados']
    const rows = metrics.map((m) => [
      m.date,
      m.revenue ?? 0,
      m.deals_won ?? 0,
      m.new_contacts ?? 0,
      m.new_leads ?? 0,
      m.messages_received ?? 0,
      m.messages_sent ?? 0,
    ])
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `analytics-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Prepare chart data
  const revenueData = metrics.map(m => ({
    date: format(new Date(m.date), 'dd MMM', { locale: es }),
    revenue: m.revenue || 0,
    deals: m.deals_won || 0
  }))

  const pipelineData = pipelineStats
    .map(p => ({
      name: p.stage_name,
      value: Number(p.total_value) || 0,
      deals: Number(p.deals_count) || 0,
      color: p.color,
    }))
    .filter(p => p.value > 0) // sin etapas en $0 (evita slices degenerados)

  const activityData = metrics.map(m => ({
    date: format(new Date(m.date), 'dd MMM', { locale: es }),
    messages: (m.messages_received || 0) + (m.messages_sent || 0),
    contacts: m.new_contacts || 0,
    leads: m.new_leads || 0
  }))

  const getInsightIcon = (category: string) => {
    switch (category) {
      case 'sales_trend': return TrendingUp
      case 'anomaly_detected': return AlertTriangle
      case 'performance_alert': return Activity
      case 'opportunity_spotted': return Lightbulb
      case 'risk_warning': return AlertTriangle
      case 'efficiency_tip': return CheckCircle2
      default: return Lightbulb
    }
  }

  const getInsightColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-400 border-red-500/30 bg-red-500/10'
      case 'warning': return 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10'
      case 'positive': return 'text-green-400 border-green-500/30 bg-green-500/10'
      default: return 'text-blue-400 border-blue-500/30 bg-blue-500/10'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Analytics & Insights</h1>
          <p className="text-zinc-400 mt-1">Métricas, predicciones e inteligencia de negocio</p>
        </div>
        <Button variant="outline" className="border-zinc-700 text-zinc-300">
          <BarChart3 className="h-4 w-4 mr-2" />
          Exportar Reporte
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-400">Revenue (30 días)</p>
                <p className="text-2xl font-bold text-white mt-1">
                  ${stats.revenue.toLocaleString()}
                </p>
                <p className="text-xs text-zinc-500 mt-1">Últimos 30 días</p>
              </div>
              <div className="h-12 w-12 rounded-lg bg-green-500/20 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-400">Deals Ganados</p>
                <p className="text-2xl font-bold text-white mt-1">{stats.dealsWon}</p>
                <p className="text-xs text-zinc-500 mt-1">Últimos 30 días</p>
              </div>
              <div className="h-12 w-12 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Target className="h-6 w-6 text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-400">Nuevos Contactos</p>
                <p className="text-2xl font-bold text-white mt-1">{stats.newContacts}</p>
                <p className="text-xs text-zinc-500 mt-1">Últimos 30 días</p>
              </div>
              <div className="h-12 w-12 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <Users className="h-6 w-6 text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-400">Tasa de Conversión</p>
                <p className="text-2xl font-bold text-white mt-1">
                  {stats.conversionRate.toFixed(1)}%
                </p>
                <p className="text-xs text-zinc-500 mt-1">Últimos 30 días</p>
              </div>
              <div className="h-12 w-12 rounded-lg bg-orange-500/20 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-orange-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-yellow-400" />
              Insights Automáticos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {insights.slice(0, 3).map((insight) => {
                const Icon = getInsightIcon(insight.category)
                return (
                  <div 
                    key={insight.id} 
                    className={`p-4 rounded-lg border ${getInsightColor(insight.severity)}`}
                  >
                    <div className="flex items-start gap-3">
                      <Icon className="h-5 w-5 mt-0.5" />
                      <div className="flex-1">
                        <h4 className="font-medium">{insight.title}</h4>
                        <p className="text-sm opacity-90 mt-1">{insight.description}</p>
                        {insight.recommended_action && (
                          <p className="text-sm mt-2 font-medium">
                            Acción recomendada: {insight.recommended_action}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {insight.category}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-zinc-900">
          <TabsTrigger value="overview" className="data-[state=active]:bg-zinc-800">
            <ActivityIcon className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="revenue" className="data-[state=active]:bg-zinc-800">
            <DollarSign className="h-4 w-4 mr-2" />
            Revenue
          </TabsTrigger>
          <TabsTrigger value="pipeline" className="data-[state=active]:bg-zinc-800">
            <PieChartIcon className="h-4 w-4 mr-2" />
            Pipeline
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          {/* Activity Chart */}
          <Card className="bg-zinc-950 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white">Actividad (Últimos 30 días)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={activityData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#52525b"
                      fontSize={12}
                      tickLine={false}
                    />
                    <YAxis 
                      stroke="#52525b"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#18181b', 
                        border: '1px solid #27272a',
                        borderRadius: '6px'
                      }}
                    />
                    <Legend />
                    <Area 
                      type="monotone" 
                      dataKey="contacts" 
                      name="Nuevos Contactos"
                      stroke="#8B5CF6" 
                      fill="#8B5CF6" 
                      fillOpacity={0.2}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="leads" 
                      name="Nuevos Leads"
                      stroke="#F59E0B" 
                      fill="#F59E0B" 
                      fillOpacity={0.2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revenue" className="mt-4 space-y-4">
          {/* Revenue Chart */}
          <Card className="bg-zinc-950 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white">Revenue & Deals (Últimos 30 días)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#52525b"
                      fontSize={12}
                      tickLine={false}
                    />
                    <YAxis 
                      stroke="#52525b"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#18181b', 
                        border: '1px solid #27272a',
                        borderRadius: '6px'
                      }}
                      formatter={(value: number) => `$${value.toLocaleString()}`}
                    />
                    <Legend />
                    <Bar 
                      dataKey="revenue" 
                      name="Revenue ($)"
                      fill="#10B981" 
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Deals Trend */}
          <Card className="bg-zinc-950 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white">Tendencia de Deals Ganados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenueData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#52525b"
                      fontSize={12}
                      tickLine={false}
                    />
                    <YAxis 
                      stroke="#52525b"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#18181b', 
                        border: '1px solid #27272a',
                        borderRadius: '6px'
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="deals" 
                      name="Deals Ganados"
                      stroke="#3B82F6" 
                      strokeWidth={2}
                      dot={{ fill: '#3B82F6', strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pipeline" className="mt-4 space-y-4">
          {/* Pipeline Distribution */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="bg-zinc-950 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white">Distribución del Pipeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pipelineData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name}: $${(value / 1000).toFixed(0)}k`}
                        innerRadius={55}
                        outerRadius={100}
                        paddingAngle={3}
                        minAngle={4}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {pipelineData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#18181b', 
                          border: '1px solid #27272a',
                          borderRadius: '6px'
                        }}
                        formatter={(value: number) => `$${value.toLocaleString()}`}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-zinc-950 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white">Deals por Etapa</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pipelineStats.map((stage) => (
                    <div key={stage.stage_id} className="flex items-center gap-3">
                      <div 
                        className="h-3 w-3 rounded-full" 
                        style={{ backgroundColor: stage.color }}
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-white text-sm">{stage.stage_name}</span>
                          <span className="text-zinc-400 text-sm">{stage.deals_count} deals</span>
                        </div>
                        <div className="mt-1">
                          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div 
                              className="h-full rounded-full transition-all"
                              style={{ 
                                backgroundColor: stage.color,
                                width: `${Math.min((stage.total_value / (pipelineStats.reduce((sum, s) => sum + (s.total_value || 0), 0) || 1)) * 100, 100)}%`
                              }}
                            />
                          </div>
                        </div>
                        <p className="text-xs text-zinc-500 mt-1">
                          ${stage.total_value?.toLocaleString()} • Avg: ${stage.avg_value?.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <Activity className="h-8 w-8 text-zinc-600 animate-spin mx-auto" />
          <p className="text-zinc-500 mt-4">Cargando analytics...</p>
        </div>
      )}
    </div>
  )
}
