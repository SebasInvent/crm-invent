// @ts-nocheck
import { NextResponse } from 'next/server'
import { getServiceRoleClient } from '@/lib/supabase'

export async function POST(request: Request) {
  try {
    const WEBHOOK_SECRET = process.env.SYNC_SECRET
    const authHeader = request.headers.get('authorization')
    if (!WEBHOOK_SECRET || authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { agent_task_id, completed_at, deliverable_data } = body

    if (!agent_task_id) {
      return NextResponse.json(
        { error: 'Missing agent_task_id' },
        { status: 400 }
      )
    }

    const supabase = getServiceRoleClient()

    const supabaseAny = supabase as any

    // Actualizar la tarea del agente
    const { data: agentTask, error: taskError } = await supabaseAny
      .from('agent_tasks')
      .update({
        status: 'completed',
        completed_at: completed_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', agent_task_id)
      .select('*')
      .single()

    if (taskError || !agentTask) {
      return NextResponse.json(
        { error: 'Agent task not found', details: taskError },
        { status: 404 }
      )
    }

    // Obtener info del agente y tarea
    const { data: agentData } = await supabase
      .from('agents')
      .select('name, email')
      .eq('id', (agentTask as any).agent_id)
      .single()

    const { data: taskData } = await supabase
      .from('tasks')
      .select('title, project_id')
      .eq('id', (agentTask as any).task_id)
      .single()

    // Si hay datos del entregable, crearlo
    if (deliverable_data) {
      const { error: deliverableError } = await supabase
        .from('agent_deliverables')
        .insert({
          agent_task_id,
          client_id: deliverable_data.client_id,
          project_id: deliverable_data.project_id,
          agent_id: agentTask.agent_id,
          title: deliverable_data.title,
          description: deliverable_data.description,
          file_url: deliverable_data.file_url,
          file_path: deliverable_data.file_path,
          file_type: deliverable_data.file_type,
          file_size: deliverable_data.file_size,
          generated_at: new Date().toISOString()
        } as any)

      if (deliverableError) {
        console.error('Error creating deliverable:', deliverableError)
      }
    }

    // Notificar al admin
    console.log(`✅ Task completed by ${agentData?.name}: ${taskData?.title}`)

    return NextResponse.json({
      success: true,
      message: 'Task marked as completed',
      agent_task_id,
      agent_name: agentData?.name
    })

  } catch (error) {
    console.error('Error in task-completed webhook:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
