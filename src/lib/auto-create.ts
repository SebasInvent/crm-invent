// @ts-nocheck
import { getServiceRoleClient } from '@/lib/supabase'
import type { Contact, Project, Task, ChatSession, Conversation } from '@/types/database'

interface CreateContactFromInteractionParams {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  source: 'telegram' | 'openclaw' | 'whatsapp' | 'web' | 'other' | 'email';
  external_id?: string;
  username?: string;
  metadata?: Record<string, any>;
}

interface AutoCreateResult {
  contact: Contact;
  project?: Project;
  task?: Task;
  is_new: boolean;
}

/**
 * Busca un contacto existente por email, phone o external_id
 */
export async function findExistingContact(
  email?: string,
  phone?: string,
  external_id?: string,
  source?: string
): Promise<Contact | null> {
  const supabase = getServiceRoleClient()

  // Buscar por email primero (más confiable)
  if (email && email !== '') {
    const { data: byEmail, error: emailError } = await supabase
      .from('contacts')
      .select('*')
      .ilike('email', email)
      .maybeSingle()
    if (byEmail) return byEmail
    if (emailError && emailError.code !== 'PGRST116') {
      console.error('[findExistingContact] Error buscando por email:', emailError)
    }
  }

  // Buscar por teléfono
  if (phone && phone !== '') {
    const { data: byPhone, error: phoneError } = await supabase
      .from('contacts')
      .select('*')
      .ilike('phone', phone)
      .maybeSingle()
    if (byPhone) return byPhone
    if (phoneError && phoneError.code !== 'PGRST116') {
      console.error('[findExistingContact] Error buscando por phone:', phoneError)
    }
  }

  // Buscar por external_id en custom_fields según el source.
  // Claves CANÓNICAS = las de ContactService.getExternalIdField (antes este
  // módulo usaba `${source}_id` para whatsapp/email/web y los contactos se
  // duplicaban según qué módulo los creara).
  if (external_id && source) {
    const CANONICAL: Record<string, string> = {
      telegram: 'telegram_chat_id',
      openclaw: 'openclaw_session_id',
      whatsapp: 'whatsapp_number',
      email: 'email_campaign_id',
      web: 'web_session_id',
    }
    const fieldName = CANONICAL[source] || `${source}_id`

    const { data: byExternal, error: externalError } = await supabase
      .from('contacts')
      .select('*')
      .eq('custom_fields->>' + fieldName, external_id)
      .maybeSingle()

    if (byExternal) return byExternal

    // Fallback: clave legacy `${source}_id` de filas creadas antes del fix
    const legacy = `${source}_id`
    if (legacy !== fieldName) {
      const { data: byLegacy } = await supabase
        .from('contacts')
        .select('*')
        .eq('custom_fields->>' + legacy, external_id)
        .maybeSingle()
      if (byLegacy) return byLegacy
    }
    if (externalError && externalError.code !== 'PGRST116') {
      console.error(`[findExistingContact] Error buscando por ${fieldName}:`, externalError)
    }
  }

  return null
}

// Mantener compatibilidad con código antiguo
export const findExistingClient = findExistingContact

/**
 * Crea un nuevo contacto desde una interacción
 */
export async function createContactFromInteraction(
  params: CreateContactFromInteractionParams
): Promise<Contact> {
  const supabase = getServiceRoleClient()

  // Separar nombre en first_name y last_name
  const nameParts = params.name?.split(' ') || ['Sin', 'Nombre']
  const firstName = nameParts[0] || 'Sin'
  const lastName = nameParts.slice(1).join(' ') || 'Nombre'

  const contactData: any = {
    first_name: firstName,
    last_name: lastName,
    email: params.email || `temp_${Date.now()}@placeholder.com`,
    phone: params.phone || null,
    company_name: params.company || null,
    type: 'lead',
    status: 'active',
    lead_source: params.source,
    last_interaction_at: new Date().toISOString()
  }

  // Agregar campos específicos según el source en custom_fields
  const customFields: Record<string, any> = params.metadata || {}
  
  if (params.external_id) {
    // Mismas claves canónicas que ContactService.getExternalIdField
    const CANONICAL: Record<string, string> = {
      telegram: 'telegram_chat_id',
      openclaw: 'openclaw_session_id',
      whatsapp: 'whatsapp_number',
      email: 'email_campaign_id',
      web: 'web_session_id',
    }
    customFields[CANONICAL[params.source] || `${params.source}_id`] = params.external_id
    if (params.source === 'telegram') customFields.telegram_username = params.username
  }

  if (Object.keys(customFields).length > 0) {
    contactData.custom_fields = customFields
  }

  const { data: contact, error } = await supabase
    .from('contacts')
    .insert(contactData)
    .select()
    .single()

  if (error) {
    console.error('[createContactFromInteraction] Error creating contact:', error)
    throw new Error(`Failed to create contact: ${error.message}`)
  }

  return contact
}

// Mantener compatibilidad con código antiguo
export const createClientFromInteraction = createContactFromInteraction

/**
 * Crea un proyecto automáticamente para un cliente
 */
export async function createAutoProject(
  clientId: string,
  source: string,
  firstMessage?: string
): Promise<Project> {
  const supabase = getServiceRoleClient()

  const projectData = {
    client_id: clientId,
    name: `Nuevo lead desde ${source}`,
    description: firstMessage 
      ? `Proyecto creado automáticamente desde ${source}. Primer contacto: "${firstMessage.substring(0, 150)}${firstMessage.length > 150 ? '...' : ''}"`
      : `Proyecto creado automáticamente desde interacción en ${source}`,
    status: 'planning' as const,
    budget: null,
    start_date: new Date().toISOString(),
    progress: 0
  }

  const { data: project, error } = await supabase
    .from('projects')
    .insert(projectData)
    .select()
    .single()

  if (error) {
    console.error('Error creating project:', error)
    throw new Error(`Failed to create project: ${error.message}`)
  }

  return project
}

/**
 * Crea una tarea inicial para responder al cliente
 */
export async function createInitialTask(
  projectId: string,
  clientName: string,
  message: string,
  source: string
): Promise<void> {
  const supabase = getServiceRoleClient()

  const { error } = await supabase
    .from('tasks')
    .insert({
      project_id: projectId,
      title: `Responder a ${clientName} - ${source}`,
      description: `Mensaje recibido: ${message}`,
      status: 'todo',
      priority: 'high',
      due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 horas
    })

  if (error) {
    console.error('Error creating task:', error)
  }
}

/**
 * Crea o actualiza una sesión de chat
 */
export async function createOrUpdateChatSession(
  clientId: string,
  externalSessionId: string,
  sessionType: 'telegram' | 'whatsapp' | 'webchat' | 'email' | 'other',
  agentId?: string
): Promise<ChatSession> {
  const supabase = getServiceRoleClient()

  // Buscar sesión existente
  const { data: existing } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('client_id', clientId)
    .eq('external_session_id', externalSessionId)
    .eq('status', 'active')
    .single()

  if (existing) {
    // Actualizar sesión existente
    const { data: updated, error } = await supabase
      .from('chat_sessions')
      .update({
        last_message_at: new Date().toISOString(),
        message_count: existing.message_count + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) throw new Error(`Failed to update session: ${error.message}`)
    return updated
  }

  // Crear nueva sesión
  const { data: session, error } = await supabase
    .from('chat_sessions')
    .insert({
      client_id: clientId,
      agent_id: agentId || null,
      session_type: sessionType,
      external_session_id: externalSessionId,
      status: 'active',
      started_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
      message_count: 1
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create session: ${error.message}`)
  return session
}

/**
 * Proceso completo: busca o crea contacto, proyecto, tarea y sesión
 */
export async function processNewInteraction(
  params: {
    name: string;
    email?: string;
    phone?: string;
    message: string;
    source: 'telegram' | 'openclaw' | 'whatsapp' | 'web' | 'other' | 'email';
    external_id: string;
    username?: string;
    agent_id?: string;
    metadata?: Record<string, any>;
  }
): Promise<AutoCreateResult> {
  // 1. Buscar contacto existente (por email, phone o external_id)
  let contact = await findExistingContact(params.email, params.phone, params.external_id, params.source)
  let isNew = false

  // 2. Crear contacto si no existe
  if (!contact) {
    contact = await createContactFromInteraction({
      name: params.name,
      email: params.email,
      phone: params.phone,
      source: params.source,
      external_id: params.external_id,
      username: params.username,
      metadata: params.metadata
    })
    isNew = true
    console.log(`[processNewInteraction] Nuevo contacto creado: ${contact.id} (${contact.email})`)
  } else {
    console.log(`[processNewInteraction] Contacto existente encontrado: ${contact.id} (${contact.email})`)
    
    // Actualizar last_interaction_at
    const supabase = getServiceRoleClient()
    await supabase
      .from('contacts')
      .update({ last_interaction_at: new Date().toISOString() })
      .eq('id', contact.id)
  }

  let project: Project | undefined
  let task: Task | undefined

  // 3. Si es contacto nuevo, crear proyecto y tarea
  if (isNew) {
    project = await createAutoProject(contact.id, params.source, params.message)
    await createInitialTask(project.id, params.name, params.message, params.source)
  }

  // 4. Crear o actualizar sesión de chat
  await createOrUpdateChatSession(
    contact.id,
    params.external_id,
    params.source,
    params.agent_id
  )

  return { contact, project, task, is_new: isNew }
}

// Mantener compatibilidad con código antiguo
export const processNewClient = processNewInteraction
