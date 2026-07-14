import { getServiceRoleClient } from './supabase'

// Tipos
export type ContactSource = 'openclaw' | 'telegram' | 'email' | 'whatsapp' | 'web' | 'manual' | 'other'

export interface ContactData {
  first_name: string
  last_name: string
  email?: string | null
  phone?: string | null
  company_name?: string | null
  type?: 'lead' | 'prospect' | 'customer' | 'partner' | 'inactive'
  status?: 'active' | 'inactive'
  lead_source?: ContactSource
  custom_fields?: Record<string, any>
}

export interface FindOrCreateParams {
  // Identificadores (al menos uno requerido)
  email?: string
  phone?: string
  external_id?: string
  source: ContactSource
  
  // Datos para crear si no existe
  name: string
  company?: string
  metadata?: Record<string, any>
  
  // Opciones
  skipCreate?: boolean  // Solo buscar, no crear
  updateIfExists?: boolean  // Actualizar datos si ya existe
}

export interface FindOrCreateResult {
  contact: any  // Contact type from database
  is_new: boolean
  was_updated: boolean
}

/**
 * Servicio unificado para gestión de contactos
 * Centraliza la lógica de búsqueda y creación de contactos
 * desde cualquier fuente (OpenClaw, Email, Telegram, etc.)
 */
export class ContactService {
  /**
   * Cliente perezoso: NO instanciar en el field initializer. El singleton
   * `contactService` se construye al importar el módulo, y `next build`
   * importa las routes que lo usan (webhook/email/reply, webhook/openclaw)
   * durante "collecting page data" — sin NEXT_PUBLIC_SUPABASE_URL en el
   * entorno de build, un cliente eager revienta el build entero.
   * Diferido al primer uso real (runtime).
   */
  private _supabase: ReturnType<typeof getServiceRoleClient> | null = null

  private get supabase(): ReturnType<typeof getServiceRoleClient> {
    if (!this._supabase) this._supabase = getServiceRoleClient()
    return this._supabase
  }

  /**
   * El cliente service-role no tiene tipos generados para estas tablas
   * (las filas resuelven a `never`). Mismo patrón (cast a any) que usan
   * las rutas API (deals, aria/*) hasta regenerar los tipos de Supabase.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private t(table: string): any {
    return this.supabase.from(table)
  }

  /**
   * Busca un contacto existente por múltiples criterios
   * Orden de búsqueda: email → phone → external_id
   */
  async findContact(
    email?: string,
    phone?: string,
    external_id?: string,
    source?: ContactSource
  ): Promise<any | null> {
    console.log('[ContactService.findContact] Buscando contacto:', { email, phone, external_id, source })

    // 1. Buscar por email (más confiable)
    if (email && email.trim() !== '') {
      // limit(1): con duplicados en BD, maybeSingle() sin límite devuelve
      // error en vez de match y rompe todo el findOrCreate.
      const { data, error } = await this.t('contacts')
        .select('*')
        .ilike('email', email.trim())
        .limit(1)
        .maybeSingle()
      
      if (data) {
        console.log('[ContactService] Encontrado por email:', data.id)
        return data
      }
      if (error && error.code !== 'PGRST116') {
        console.error('[ContactService] Error buscando por email:', error)
      }
    }

    // 2. Buscar por teléfono
    if (phone && phone.trim() !== '') {
      const cleanPhone = phone.replace(/[^\d]/g, '')
      // Sanear el valor crudo: coma/paréntesis/punto son sintaxis del filtro
      // .or() de PostgREST — sin escapar, un teléfono "(301) 555..." inyecta
      // condiciones o rompe el parser.
      const safePhone = phone.trim().replace(/[(),."'\\]/g, '')
      const { data, error } = await this.t('contacts')
        .select('*')
        .or(`phone.ilike.%${safePhone}%,phone.ilike.%${cleanPhone}%`)
        .limit(1)
        .maybeSingle()
      
      if (data) {
        console.log('[ContactService] Encontrado por teléfono:', data.id)
        return data
      }
      if (error && error.code !== 'PGRST116') {
        console.error('[ContactService] Error buscando por teléfono:', error)
      }
    }

    // 3. Buscar por external_id en custom_fields
    if (external_id && source) {
      const fieldName = this.getExternalIdField(source)
      
      const { data, error } = await this.t('contacts')
        .select('*')
        .eq(`custom_fields->>${fieldName}`, external_id)
        .maybeSingle()
      
      if (data) {
        console.log(`[ContactService] Encontrado por ${fieldName}:`, data.id)
        return data
      }
      if (error && error.code !== 'PGRST116') {
        console.error(`[ContactService] Error buscando por ${fieldName}:`, error)
      }
    }

    console.log('[ContactService] Contacto no encontrado')
    return null
  }

  /**
   * Busca o crea un contacto
   * Es la función principal que usan todos los webhooks
   */
  async findOrCreate(params: FindOrCreateParams): Promise<FindOrCreateResult> {
    const { email, phone, external_id, source, name, company, metadata, skipCreate, updateIfExists } = params

    // Buscar contacto existente
    let contact = await this.findContact(email, phone, external_id, source)
    
    if (contact) {
      console.log('[ContactService.findOrCreate] Contacto existente:', contact.id)
      
      // Actualizar si es necesario
      if (updateIfExists && (email || phone || metadata)) {
        const updateData: any = {
          updated_at: new Date().toISOString()
        }
        
        if (email && !contact.email) updateData.email = email
        if (phone && !contact.phone) updateData.phone = phone
        if (company && !contact.company_name) updateData.company_name = company
        
        // Actualizar custom_fields
        if (metadata || external_id) {
          const customFields = { ...contact.custom_fields }
          
          if (external_id && source) {
            const fieldName = this.getExternalIdField(source)
            customFields[fieldName] = external_id
          }
          
          if (metadata) {
            Object.assign(customFields, metadata)
          }
          
          updateData.custom_fields = customFields
        }

        const { data: updated, error } = await this.t('contacts')
          .update(updateData)
          .eq('id', contact.id)
          .select()
          .single()

        if (error) {
          console.error('[ContactService] Error actualizando contacto:', error)
        } else {
          contact = updated
          console.log('[ContactService] Contacto actualizado:', contact.id)
        }
      }

      // Actualizar last_interaction_at
      await this.updateLastInteraction(contact.id)

      return { contact, is_new: false, was_updated: updateIfExists || false }
    }

    // No se encontró y no debemos crear
    if (skipCreate) {
      return { contact: null, is_new: false, was_updated: false }
    }

    // Crear nuevo contacto
    contact = await this.createContact({
      name,
      email,
      phone,
      company,
      source,
      external_id,
      metadata
    })

    console.log('[ContactService.findOrCreate] Nuevo contacto creado:', contact.id)
    return { contact, is_new: true, was_updated: false }
  }

  /**
   * Crea un nuevo contacto
   */
  async createContact(params: {
    name: string
    email?: string
    phone?: string
    company?: string
    source: ContactSource
    external_id?: string
    metadata?: Record<string, any>
  }): Promise<any> {
    const { name, email, phone, company, source, external_id, metadata } = params

    // Separar nombre
    const nameParts = name?.trim().split(' ') || ['Sin', 'Nombre']
    const firstName = nameParts[0] || 'Sin'
    const lastName = nameParts.slice(1).join(' ') || 'Nombre'

    // Construir custom_fields
    const customFields: Record<string, any> = {
      ...metadata
    }

    if (external_id) {
      const fieldName = this.getExternalIdField(source)
      customFields[fieldName] = external_id
    }

    const contactData: ContactData = {
      first_name: firstName,
      last_name: lastName,
      email: email || null,
      phone: phone || null,
      company_name: company || null,
      type: 'lead',
      status: 'active',
      lead_source: source,
      custom_fields: Object.keys(customFields).length > 0 ? customFields : undefined
    }

    const { data, error } = await this.t('contacts')
      .insert(contactData)
      .select()
      .single()

    if (error) {
      console.error('[ContactService.createContact] Error:', error)
      throw new Error(`Failed to create contact: ${error.message}`)
    }

    return data
  }

  /**
   * Actualiza la fecha de última interacción
   */
  async updateLastInteraction(contactId: string): Promise<void> {
    const { error } = await this.t('contacts')
      .update({ 
        last_interaction_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', contactId)

    if (error) {
      console.error('[ContactService.updateLastInteraction] Error:', error)
    }
  }

  /**
   * Obtiene el nombre del campo de external_id según la fuente
   */
  private getExternalIdField(source: ContactSource): string {
    const fieldMap: Record<ContactSource, string> = {
      'telegram': 'telegram_chat_id',
      'openclaw': 'openclaw_session_id',
      'whatsapp': 'whatsapp_number',
      'email': 'email_campaign_id',
      'web': 'web_session_id',
      'manual': 'manual_entry_id',
      'other': 'external_id'
    }
    return fieldMap[source] || `${source}_id`
  }

  /**
   * Detecta y fusiona contactos duplicados
   */
  async mergeDuplicateContacts(primaryId: string, duplicateId: string): Promise<void> {
    console.log(`[ContactService.mergeDuplicateContacts] Fusionando ${duplicateId} en ${primaryId}`)

    // Transferir relaciones
    const tablesToUpdate = [
      { table: 'chat_sessions', field: 'client_id', newField: 'contact_id' },
      { table: 'conversations', field: 'client_id', newField: 'contact_id' },
      { table: 'projects', field: 'client_id', newField: 'contact_id' },
      { table: 'deals', field: 'contact_id' },  // Ya usa contact_id
      { table: 'unified_messages', field: 'contact_id' }
    ]

    for (const { table, field, newField } of tablesToUpdate) {
      const targetField = newField || field
      const { error } = await this.t(table)
        .update({ [targetField]: primaryId })
        .eq(field, duplicateId)

      if (error) {
        console.error(`[ContactService] Error actualizando ${table}:`, error)
      }
    }

    // Marcar duplicado como inactivo o eliminar
    await this.t('contacts')
      .update({ 
        status: 'inactive',
        custom_fields: { 
          merged_into: primaryId,
          is_duplicate: true 
        }
      })
      .eq('id', duplicateId)

    console.log('[ContactService] Contactos fusionados exitosamente')
  }

  /**
   * Busca contactos potencialmente duplicados
   */
  async findPotentialDuplicates(contactId: string): Promise<any[]> {
    const { data: contact } = await this.t('contacts')
      .select('email, phone')
      .eq('id', contactId)
      .single()

    if (!contact) return []

    const conditions: string[] = []
    
    if (contact.email) {
      conditions.push(`email.eq.${contact.email}`)
    }
    if (contact.phone) {
      const cleanPhone = contact.phone.replace(/[^\d]/g, '')
      conditions.push(`phone.eq.${contact.phone}`)
      conditions.push(`phone.eq.${cleanPhone}`)
    }

    if (conditions.length === 0) return []

    const { data: duplicates } = await this.t('contacts')
      .select('*')
      .or(conditions.join(','))
      .neq('id', contactId)
      .eq('status', 'active')

    return duplicates || []
  }
}

// Exportar instancia singleton
export const contactService = new ContactService()

// Funciones de conveniencia para compatibilidad
export async function findOrCreateContact(params: FindOrCreateParams): Promise<FindOrCreateResult> {
  return contactService.findOrCreate(params)
}

export async function findContact(
  email?: string,
  phone?: string,
  external_id?: string,
  source?: ContactSource
): Promise<any | null> {
  return contactService.findContact(email, phone, external_id, source)
}
