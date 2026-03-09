// @ts-nocheck
import { NextResponse } from 'next/server'
import { getServiceRoleClient } from '@/lib/supabase'

// POST /api/leads/scrape - Iniciar scraping de leads
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { 
      sources, // ['linkedin', 'google_maps', 'mercado_libre']
      archetypes, // ['hero_entrepreneur', 'ruler_executive']
      industries,
      location,
      keywords,
      maxResults = 50
    } = body
    
    const supabase = getServiceRoleClient()
    const results = []
    
    // Simular scraping para cada fuente
    for (const source of sources) {
      const scrapedLeads = await scrapeFromSource(source, {
        archetypes,
        industries,
        location,
        keywords,
        maxResults: Math.floor(maxResults / sources.length)
      })
      
      results.push(...scrapedLeads)
    }
    
    // Guardar leads en la base de datos
    const savedLeads = []
    for (const lead of results) {
      // Verificar si ya existe
      const { data: existing } = await supabase
        .from('leads')
        .select('id')
        .eq('email', lead.email)
        .single()
      
      if (!existing) {
        const { data: saved } = await supabase
          .from('leads')
          .insert({
            ...lead,
            source: 'scraped',
            lead_status: 'cold',
            created_at: new Date().toISOString()
          })
          .select()
          .single()
        
        if (saved) savedLeads.push(saved)
      }
    }
    
    return NextResponse.json({
      success: true,
      scraped: results.length,
      saved: savedLeads.length,
      leads: savedLeads
    })
    
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Función simulada de scraping
async function scrapeFromSource(source: string, params: any) {
  const mockLeads = []
  
  // Simular resultados basados en arquetipos
  const archetypeProfiles = {
    hero_entrepreneur: {
      names: ['Carlos Founder', 'Ana Startup', 'David CEO', 'Laura Innovación'],
      companies: ['TechStart', 'Innovación Labs', 'FutureCo', ' disruptiva'],
      titles: ['CEO', 'Founder', 'Co-Founder', 'Director de Innovación']
    },
    sage_conservative: {
      names: ['Roberto Empresas', 'María Tradición', 'Jorge Negocios', 'Carmen Familiar'],
      companies: ['Empresas García', 'Negocios Tradición', 'Familia & Co', 'Servicios LP'],
      titles: ['Dueño', 'Gerente General', 'Director', 'Propietario']
    },
    ruler_executive: {
      names: ['Andrés Resultados', 'Sofía Métricas', 'Miguel Data', 'Valentina ROI'],
      companies: ['Corp Colombia', 'Grupo Ejecutivo', 'Empresa Data', 'Metrics Inc'],
      titles: ['COO', 'CEO', 'Director de Ventas', 'VP Comercial']
    }
  }
  
  const count = Math.min(params.maxResults, 10)
  
  for (let i = 0; i < count; i++) {
    const archetype = params.archetypes[i % params.archetypes.length]
    const profile = archetypeProfiles[archetype as keyof typeof archetypeProfiles] || archetypeProfiles.hero_entrepreneur
    
    mockLeads.push({
      name: profile.names[i % profile.names.length],
      email: `lead${i}@${source}scraped.com`,
      phone: `+57 300 ${Math.floor(Math.random() * 9000000 + 1000000)}`,
      company: profile.companies[i % profile.companies.length],
      job_title: profile.titles[i % profile.titles.length],
      jung_archetype: archetype,
      industry: params.industries?.[0] || 'Tecnología',
      company_size: ['startup', 'small', 'medium'][Math.floor(Math.random() * 3)],
      location: params.location || 'Bogotá',
      source_platform: source as any,
      budget_level: ['high', 'medium', 'low'][Math.floor(Math.random() * 3)],
      authority_level: ['decision_maker', 'influencer', 'user'][Math.floor(Math.random() * 3)],
      need_urgency: ['high', 'medium', 'low'][Math.floor(Math.random() * 3)],
      timeline: ['immediate', 'short_term', 'medium_term'][Math.floor(Math.random() * 3)],
      scraped_data: {
        source: source,
        keywords: params.keywords,
        scraped_at: new Date().toISOString()
      }
    })
  }
  
  return mockLeads
}
