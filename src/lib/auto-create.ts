// @ts-nocheck
import { getServiceRoleClient } from '@/lib/supabase'
import type { Client, Project, Task, ChatSession, Conversation } from '@/types/database'

interface CreateClientFromInteractionParams {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  source: 'telegram' | 'openclaw' | 'whatsapp' | 'web' | 'other';
  external_id?: string; // telegram_chat_id, openclaw_session_id, etc.
  username?: string;
  metadata?: Record<string, any>;
}

interface AutoCreateResult {
  client: Client;
  project?: Project;
  task?: Task;
  is_new: boolean;
}

/**
 * Busca un cliente existente por email o external_id
 */
export async function findExistingClient(
  email?: string,
  external_id?: string,
  source?: string
): Promise<Client | null> {
  const supabase = getServiceRoleClient()

  // Buscar por email
  if (email) {
    const { data: byEmail } = await supabase
      .from('clients')
      .select('*')
      .eq('email', email)
      .single()
    if (byEmail) return byEmail
  }

  // Buscar por external_id según el source
  if (external_id && source) {
    let query = supabase.from('clients').select('*')
    
    if (source === 'telegram') {
      query = query.eq('telegram_chat_id', external_id)
    } else if (source === 'openclaw') {
      query = query.eq('openclaw_session_id', external_id)
    }
    
    const { data: byExternal } = await query.single()
    if (byExternal) return byExternal
  }

  return null
}

/**
 * Crea un nuevo cliente desde una interacción
 */
export async function createClientFromInteraction(
  params: CreateClientFromInteractionParams
): Promise<Client> {
  const supabase = getServiceRoleClient()

  const clientData: Partial<Client> = {
    name: params.name,
    email: params.email || `temp_${Date.now()}@placeholder.com`,
    phone: params.phone || null,
    company: params.company || null,
    status: 'lead',
    priority: 'medium',
    lifetime_value: 0,
    source: params.source,
    metadata: params.metadata || null,
    last_interaction_at: new Date().toISOString()
  }

  // Agregar campos específicos según el source
  if (params.source === 'telegram' && params.external_id) {
    clientData.telegram_chat_id = params.external_id
    clientData.telegram_username = params.username
  } else if (params.source === 'openclaw' && params.external_id) {
    clientData.openclaw_session_id = params.external_id
  }

  const { data: client, error } = await supabase
    .from('clients')
    .insert(clientData)
    .select()
    .single()

  if (error) {
    console.error('Error creating client:', error)
    throw new Error(`Failed to create client: ${error.message}`)
  }

  return client
}

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
 * Proceso completo: busca o crea cliente, proyecto, tarea y sesión
 */
export async function processNewInteraction(
  params: {
    name: string;
    email?: string;
    message: string;
    source: 'telegram' | 'openclaw' | 'whatsapp' | 'web' | 'other';
    external_id: string;
    username?: string;
    agent_id?: string;
    metadata?: Record<string, any>;
  }
): Promise<AutoCreateResult> {
  // 1. Buscar cliente existente
  let client = await findExistingClient(params.email, params.external_id, params.source)
  let isNew = false

  // 2. Crear cliente si no existe
  if (!client) {
    client = await createClientFromInteraction({
      name: params.name,
      email: params.email,
      source: params.source,
      external_id: params.external_id,
      username: params.username,
      metadata: params.metadata
    })
    isNew = true
  } else {
    // Actualizar last_interaction_at
    const supabase = getServiceRoleClient()
    await supabase
      .from('clients')
      .update({ last_interaction_at: new Date().toISOString() })
      .eq('id', client.id)
  }

  let project: Project | undefined
  let task: Task | undefined

  // 3. Si es cliente nuevo, crear proyecto y tarea
  if (isNew) {
    project = await createAutoProject(client.id, params.source, params.message)
    await createInitialTask(project.id, params.name, params.message, params.source)
  }

  // 4. Crear o actualizar sesión de chat
  await createOrUpdateChatSession(
    client.id,
    params.external_id,
    params.source,
    params.agent_id
  )

  return { client, project, task, is_new: isNew }
}
