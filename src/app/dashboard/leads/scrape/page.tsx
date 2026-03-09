export const dynamic = 'force-dynamic'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Globe, 
  Search, 
  Users, 
  Building2, 
  MapPin, 
  Linkedin,
  Instagram,
  Play,
  Pause,
  Download,
  Settings,
  AlertCircle,
  CheckCircle2,
  Target
} from 'lucide-react'

const scrapingSources = [
  {
    id: 'linkedin',
    name: 'LinkedIn Sales Navigator',
    icon: Linkedin,
    description: 'Busca profesionales por cargo, industria y ubicación',
    enabled: true,
    rateLimit: '100 búsquedas/día',
    archetypes: ['ruler_executive', 'caregiver_stressed']
  },
  {
    id: 'google_maps',
    name: 'Google Maps Business',
    icon: MapPin,
    description: 'Encuentra negocios locales con datos de contacto',
    enabled: true,
    rateLimit: '1000 lugares/día',
    archetypes: ['sage_conservative', 'artist_specialist']
  },
  {
    id: 'instagram',
    name: 'Instagram Business',
    icon: Instagram,
    description: 'Identifica marcas D2C y comerciantes digitales',
    enabled: false,
    rateLimit: '500 perfiles/día',
    archetypes: ['explorer_merchant', 'artist_specialist']
  },
  {
    id: 'mercado_libre',
    name: 'Mercado Libre Tiendas',
    icon: Building2,
    description: 'Vendedores con alta rotación y potencial de crecimiento',
    enabled: true,
    rateLimit: '500 tiendas/día',
    archetypes: ['explorer_merchant', 'hero_entrepreneur']
  },
  {
    id: 'rappi',
    name: 'Rappi Aliados',
    icon: Building2,
    description: 'Restaurantes y negocios en plataformas de delivery',
    enabled: true,
    rateLimit: '200 aliados/día',
    archetypes: ['sage_conservative', 'explorer_merchant']
  }
]

const industries = [
  'Tecnología/SaaS',
  'Real Estate',
  'Educación',
  'Salud/Wellness',
  'Retail/E-commerce',
  'Profesionales',
  'Turismo/Hotelería',
  'Restaurantes/F&B',
  'Manufactura',
  'Servicios'
]

const companySizes = [
  { value: 'startup', label: 'Startup (1-10)', archetypes: ['hero_entrepreneur'] },
  { value: 'small', label: 'Pequeña (10-50)', archetypes: ['sage_conservative', 'artist_specialist'] },
  { value: 'medium', label: 'Mediana (50-200)', archetypes: ['caregiver_stressed', 'ruler_executive'] },
  { value: 'large', label: 'Grande (200+)', archetypes: ['ruler_executive'] },
  { value: 'enterprise', label: 'Enterprise', archetypes: ['ruler_executive'] }
]

export default function LeadScraperPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Globe className="h-8 w-8 text-primary" />
            Lead Scraper
          </h1>
          <p className="text-muted-foreground mt-1">
            Encuentra y extrae contactos de prospectos potenciales
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
          <Button variant="outline">
            <Settings className="h-4 w-4 mr-2" />
            Configuración
          </Button>
        </div>
      </div>

      {/* Disclaimer ético */}
      <Card className="bg-yellow-50 border-yellow-200">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div>
              <h3 className="font-medium text-yellow-800">Importante: Scraping ético</h3>
              <p className="text-sm text-yellow-700 mt-1">
                Este sistema realiza scraping de información pública disponible en sitios web. 
                Siempre verifica los términos de servicio de cada plataforma y obtén consentimiento 
                antes de contactar prospectos. Respeta las leyes de protección de datos (LGPD/GDPR).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="search" className="space-y-6">
        <TabsList>
          <TabsTrigger value="search">Búsqueda Avanzada</TabsTrigger>
          <TabsTrigger value="sources">Fuentes</TabsTrigger>
          <TabsTrigger value="results">Resultados</TabsTrigger>
          <TabsTrigger value="templates">Plantillas</TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="space-y-6">
          {/* Search Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Configurar Búsqueda por Arquetipo Jung
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Arquetipos */}
              <div className="space-y-3">
                <label className="text-sm font-medium">Arquetipos de Jung a buscar</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { id: 'hero_entrepreneur', label: '🚀 Emprendedor Visionario', desc: 'Startups, founders, CEOs disruptivos' },
                    { id: 'sage_conservative', label: '🛡️ Empresario Conservador', desc: 'PYMES tradicionales, negocios familiares' },
                    { id: 'caregiver_stressed', label: '💆 Marketing Manager', desc: 'CMOs, directores de marketing sobrecargados' },
                    { id: 'artist_specialist', label: '🎨 Especialista Independiente', desc: 'Consultores, coaches, profesionales' },
                    { id: 'ruler_executive', label: '👑 Ejecutivo Results-Driven', desc: 'CEOs, COOs orientados a métricas' },
                    { id: 'explorer_merchant', label: '🛍️ Comerciante Digital', desc: 'E-commerce, vendedores online' }
                  ].map((archetype) => (
                    <div 
                      key={archetype.id}
                      className="flex items-start gap-2 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                    >
                      <input type="checkbox" className="mt-1" defaultChecked />
                      <div>
                        <p className="font-medium text-sm">{archetype.label}</p>
                        <p className="text-xs text-muted-foreground">{archetype.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Industrias */}
                <div className="space-y-3">
                  <label className="text-sm font-medium">Industrias objetivo</label>
                  <select className="w-full p-2 border rounded-md" multiple size={5}>
                    {industries.map(industry => (
                      <option key={industry} value={industry}>{industry}</option>
                    ))}
                  </select>
                </div>

                {/* Tamaño de empresa */}
                <div className="space-y-3">
                  <label className="text-sm font-medium">Tamaño de empresa</label>
                  <div className="space-y-2">
                    {companySizes.map(size => (
                      <div key={size.value} className="flex items-center gap-2">
                        <input type="checkbox" id={size.value} />
                        <label htmlFor={size.value} className="text-sm">{size.label}</label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Ubicación */}
              <div className="space-y-3">
                <label className="text-sm font-medium">Ubicación</label>
                <div className="flex gap-2">
                  <Input placeholder="Ciudad (ej: Bogotá, Medellín, Cali)" className="flex-1" />
                  <Input placeholder="País" defaultValue="Colombia" />
                  <Input placeholder="Radio (km)" defaultValue="50" className="w-24" />
                </div>
              </div>

              {/* Keywords */}
              <div className="space-y-3">
                <label className="text-sm font-medium">Keywords de búsqueda</label>
                <Textarea 
                  placeholder="Ej: agencia de marketing, desarrollo de apps, consultoría digital, e-commerce, fintech..."
                  rows={3}
                />
              </div>

              {/* Fuentes a scrapear */}
              <div className="space-y-3">
                <label className="text-sm font-medium">Fuentes de datos</label>
                <div className="flex flex-wrap gap-2">
                  {scrapingSources.filter(s => s.enabled).map(source => (
                    <Badge key={source.id} variant="secondary" className="cursor-pointer">
                      <source.icon className="h-3 w-3 mr-1" />
                      {source.name}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Acciones */}
              <div className="flex gap-3 pt-4 border-t">
                <Button size="lg" className="flex-1">
                  <Search className="h-5 w-5 mr-2" />
                  Iniciar Búsqueda
                </Button>
                <Button variant="outline" size="lg">
                  <Pause className="h-5 w-5 mr-2" />
                  Pausar
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sources" className="space-y-4">
          {scrapingSources.map(source => (
            <Card key={source.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                      <source.icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium flex items-center gap-2">
                        {source.name}
                        {source.enabled ? (
                          <Badge variant="default" className="bg-green-100 text-green-800">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Activo
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Inactivo</Badge>
                        )}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">{source.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>Rate limit: {source.rateLimit}</span>
                        <span>Arquetipos: {source.archetypes.length}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4 mr-2" />
                      Configurar
                    </Button>
                    <Button variant={source.enabled ? "secondary" : "default"} size="sm">
                      {source.enabled ? 'Desactivar' : 'Activar'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="results">
          <Card>
            <CardHeader>
              <CardTitle>Resultados del Scraping</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No hay resultados aún</h3>
                <p className="text-muted-foreground mb-4">
                  Configura y ejecuta una búsqueda para ver los resultados aquí.
                </p>
                <Button onClick={() => document.querySelector('[data-value="search"]')?.dispatchEvent(new Event('click'))}>
                  Ir a Búsqueda
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates">
          <Card>
            <CardHeader>
              <CardTitle>Plantillas de Comunicación por Arquetipo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { 
                    archetype: 'hero_entrepreneur', 
                    title: '🚀 Para Emprendedores Visionarios',
                    tone: 'Ambiciosa, disruptiva, enfocada en crecimiento',
                    opener: '¿Listo para escalar tu negocio 10x este año?',
                    key_points: ['Crecimiento acelerado', 'Innovación digital', 'Ventaja competitiva']
                  },
                  { 
                    archetype: 'sage_conservative', 
                    title: '🛡️ Para Empresarios Conservadores',
                    tone: 'Profesional, confiable, basada en resultados',
                    opener: 'Ayudamos a empresas como la suya a crecer de forma segura',
                    key_points: ['Resultados medibles', 'Procesos probados', 'Sin riesgos']
                  },
                  { 
                    archetype: 'caregiver_stressed', 
                    title: '💆 Para Marketing Managers',
                    tone: 'Empática, colaborativa, alivio de carga',
                    opener: 'Entendemos la presión de entregar resultados con recursos limitados',
                    key_points: ['Equipo extendido', 'Ejecución ágil', 'Resultados rápidos']
                  },
                  { 
                    archetype: 'artist_specialist', 
                    title: '🎨 Para Especialistas Independientes',
                    tone: 'Creativa, personal, auténtica',
                    opener: 'Convierte tu expertise en tu mejor canal de ventas',
                    key_points: ['Marca personal', 'Automatización', 'Autoridad digital']
                  },
                  { 
                    archetype: 'ruler_executive', 
                    title: '👑 Para Ejecutivos Results-Driven',
                    tone: 'Directa, data-driven, ROI-focused',
                    opener: 'Leads cualificados predecibles para su pipeline de ventas',
                    key_points: ['ROI medible', 'Pipeline consistente', 'Costo por lead optimizado']
                  },
                  { 
                    archetype: 'explorer_merchant', 
                    title: '🛍️ Para Comerciantes Digitales',
                    tone: 'Entusiasta, orientada a ventas, escalable',
                    opener: 'Multiplica tus ventas online sin aumentar tu ad spend',
                    key_points: ['ROAS mejorado', 'Escalabilidad', 'Optimización de campañas']
                  }
                ].map((template) => (
                  <div key={template.archetype} className="border rounded-lg p-4">
                    <h4 className="font-medium mb-2">{template.title}</h4>
                    <p className="text-sm text-muted-foreground mb-2">Tono: {template.tone}</p>
                    <p className="text-sm font-medium mb-2">Apertura sugerida:</p>
                    <p className="text-sm bg-muted p-2 rounded mb-3">"{template.opener}"</p>
                    <div className="flex flex-wrap gap-2">
                      {template.key_points.map(point => (
                        <Badge key={point} variant="secondary" className="text-xs">{point}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
