// Tipos para Gestión de Proyectos Mejorada - Fase 4

export interface TimeEntry {
  id: string;
  project_id?: string;
  task_id?: string;
  contact_id?: string;
  agent_id?: string;
  
  description?: string;
  start_time: string;
  end_time?: string;
  duration_minutes?: number;
  
  is_manual_entry: boolean;
  manual_date?: string;
  
  billable: boolean;
  hourly_rate?: number;
  billed: boolean;
  invoice_id?: string;
  
  status: 'running' | 'completed' | 'paused';
  source: 'manual' | 'timer' | 'integration' | 'calendar';
  
  created_at: string;
  updated_at: string;
  
  // Joined fields
  calculated_duration?: number;
  calculated_cost?: number;
  project_name?: string;
  task_name?: string;
  agent_name?: string;
}

export interface Milestone {
  id: string;
  project_id: string;
  
  name: string;
  description?: string;
  
  due_date: string;
  completed_date?: string;
  
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  
  owner_id?: string;
  owner_name?: string;
  
  dependencies: string[];
  
  success_criteria?: string;
  budget_allocated?: number;
  
  order_index: number;
  
  created_at: string;
  updated_at: string;
}

export interface TaskDependency {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  dependency_type: 'finish_to_start' | 'start_to_start' | 'finish_to_finish' | 'start_to_finish';
  lag_days: number;
  created_at: string;
  
  // Joined
  task_name?: string;
  depends_on_task_name?: string;
}

export interface ResourceAllocation {
  id: string;
  agent_id?: string;
  team_id?: string;
  
  project_id?: string;
  task_id?: string;
  
  allocation_percentage: number;
  hours_per_week?: number;
  
  start_date?: string;
  end_date?: string;
  
  role?: string;
  
  created_at: string;
  updated_at: string;
  
  // Joined
  agent_name?: string;
  project_name?: string;
  task_name?: string;
}

export interface ProjectBudget {
  id: string;
  project_id: string;
  
  total_budget?: number;
  
  labor_budget?: number;
  materials_budget?: number;
  services_budget?: number;
  overhead_budget?: number;
  
  spent_labor: number;
  spent_materials: number;
  spent_services: number;
  spent_overhead: number;
  
  warning_threshold: number;
  
  currency: string;
  
  created_at: string;
  updated_at: string;
  
  // Computed
  total_spent?: number;
  budget_remaining?: number;
  budget_used_percentage?: number;
}

// Para Gantt
export interface GanttTask {
  id: string;
  project_id: string;
  text: string; // name
  start_date: string;
  end_date: string;
  status: string;
  priority: string;
  progress: number;
  parent_task_id?: string;
  project_name?: string;
  assigned_to_name?: string;
  gantt_status: 'completed' | 'in_progress' | 'overdue' | 'pending';
  
  // Para librería gantt
  type?: 'task' | 'project' | 'milestone';
  open?: boolean;
  duration?: number; // en días
}

export interface ProjectSummary {
  id: string;
  name: string;
  description?: string;
  status: string;
  progress: number;
  
  client_first_name?: string;
  client_last_name?: string;
  client_company?: string;
  manager_name?: string;
  
  total_tasks: number;
  completed_tasks: number;
  in_progress_tasks: number;
  pending_tasks: number;
  
  total_hours_logged: number;
  
  total_milestones: number;
  completed_milestones: number;
  
  total_budget?: number;
  total_spent?: number;
  calculated_progress: number;
}

export interface ResourceWorkload {
  agent_id: string;
  agent_name: string;
  agent_email?: string;
  
  active_projects: number;
  assigned_tasks: number;
  completed_tasks: number;
  
  hours_this_week: number;
  total_hours: number;
  total_allocation: number;
}

// Timer para tracking en tiempo real
export interface TimerState {
  isRunning: boolean;
  startTime?: string;
  currentEntryId?: string;
  projectId?: string;
  taskId?: string;
  description?: string;
}

// Filtros
export interface ProjectFilter {
  status?: string;
  client_id?: string;
  manager_id?: string;
  date_from?: string;
  date_to?: string;
  budget_status?: 'under' | 'over' | 'warning';
}

export interface TimeEntryFilter {
  project_id?: string;
  task_id?: string;
  agent_id?: string;
  billable?: boolean;
  date_from?: string;
  date_to?: string;
  status?: string;
}
