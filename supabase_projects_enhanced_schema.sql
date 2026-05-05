-- CRM Fase 4: Gestión de Proyectos Mejorada
-- Schema para Gantt, Time Tracking y Resource Management

-- ============================================
-- TIME ENTRIES (Registro de tiempo)
-- ============================================

CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relaciones
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id),
  agent_id UUID REFERENCES agents(id),
  
  -- Tiempo
  description TEXT,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER, -- Calculado o manual
  
  -- Si es tiempo manual (sin start/end real)
  is_manual_entry BOOLEAN DEFAULT false,
  manual_date DATE, -- Para entradas de tiempo pasado
  
  -- Facturación
  billable BOOLEAN DEFAULT true,
  hourly_rate DECIMAL(10,2), -- Rate aplicado en el momento
  billed BOOLEAN DEFAULT false,
  invoice_id UUID, -- Referencia a factura si ya fue facturado
  
  -- Estado
  status TEXT DEFAULT 'completed' CHECK (status IN ('running', 'completed', 'paused')),
  
  -- Metadata
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'timer', 'integration', 'calendar')),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_project ON time_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_task ON time_entries(task_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_agent ON time_entries(agent_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(start_time);
CREATE INDEX IF NOT EXISTS idx_time_entries_billable ON time_entries(billable, billed);

-- Vista de time entries con cálculos
CREATE OR REPLACE VIEW time_entries_view AS
SELECT 
  te.*,
  COALESCE(te.duration_minutes, 
    CASE 
      WHEN te.end_time IS NOT NULL 
      THEN EXTRACT(EPOCH FROM (te.end_time - te.start_time))/60
      ELSE NULL 
    END
  ) as calculated_duration,
  COALESCE(te.hourly_rate, 0) * COALESCE(te.duration_minutes, 0) / 60 as calculated_cost
FROM time_entries te;

-- ============================================
-- MILESTONES (Hitos de proyectos)
-- ============================================

CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  description TEXT,
  
  -- Fechas
  due_date DATE NOT NULL,
  completed_date DATE,
  
  -- Estado
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'overdue')),
  
  -- Responsable
  owner_id UUID REFERENCES agents(id),
  
  -- Dependencias (milestone debe completarse antes)
  dependencies UUID[] DEFAULT '{}',
  
  -- Éxito/Presupuesto
  success_criteria TEXT,
  budget_allocated DECIMAL(10,2),
  
  order_index INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_due_date ON milestones(due_date);
CREATE INDEX IF NOT EXISTS idx_milestones_status ON milestones(status);

-- ============================================
-- TASK DEPENDENCIES (Dependencias entre tareas)
-- ============================================

CREATE TABLE IF NOT EXISTS task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  
  -- Tipo de dependencia
  dependency_type TEXT DEFAULT 'finish_to_start' CHECK (dependency_type IN (
    'finish_to_start', -- A debe terminar antes de que B empiece
    'start_to_start',  -- A debe empezar antes de que B empiece
    'finish_to_finish', -- A debe terminar antes de que B termine
    'start_to_finish'  -- A debe empezar antes de que B termine
  )),
  
  lag_days INTEGER DEFAULT 0, -- Días de espera entre dependencias
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_deps_task ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_deps_depends ON task_dependencies(depends_on_task_id);

-- Evitar ciclos en dependencias
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_deps_unique 
ON task_dependencies(task_id, depends_on_task_id);

-- ============================================
-- RESOURCE ALLOCATIONS (Asignación de recursos)
-- ============================================

CREATE TABLE IF NOT EXISTS resource_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Recurso (agente o equipo)
  agent_id UUID REFERENCES agents(id),
  team_id UUID, -- Para equipos (futuro)
  
  -- Asignación
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  
  -- Capacidad asignada
  allocation_percentage INTEGER DEFAULT 100 CHECK (allocation_percentage >= 0 AND allocation_percentage <= 100),
  hours_per_week DECIMAL(5,2), -- Horas semanales dedicadas
  
  -- Período
  start_date DATE,
  end_date DATE,
  
  -- Rol en el proyecto
  role TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resource_alloc_agent ON resource_allocations(agent_id);
CREATE INDEX IF NOT EXISTS idx_resource_alloc_project ON resource_allocations(project_id);
CREATE INDEX IF NOT EXISTS idx_resource_alloc_task ON resource_allocations(task_id);
CREATE INDEX IF NOT EXISTS idx_resource_alloc_dates ON resource_allocations(start_date, end_date);

-- ============================================
-- PROJECT BUDGETS (Presupuestos de proyecto)
-- ============================================

CREATE TABLE IF NOT EXISTS project_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Presupuesto total
  total_budget DECIMAL(12,2),
  
  -- Desglose por categoría
  labor_budget DECIMAL(12,2),
  materials_budget DECIMAL(12,2),
  services_budget DECIMAL(12,2),
  overhead_budget DECIMAL(12,2),
  
  -- Gastado hasta ahora (calculado via triggers)
  spent_labor DECIMAL(12,2) DEFAULT 0,
  spent_materials DECIMAL(12,2) DEFAULT 0,
  spent_services DECIMAL(12,2) DEFAULT 0,
  spent_overhead DECIMAL(12,2) DEFAULT 0,
  
  -- Alertas
  warning_threshold INTEGER DEFAULT 80, -- % de presupuesto para alerta
  
  currency TEXT DEFAULT 'USD',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_budgets_project ON project_budgets(project_id);

-- ============================================
-- VISTAS PARA GANTT Y REPORTES
-- ============================================

-- Vista de tareas para Gantt
CREATE OR REPLACE VIEW gantt_tasks_view AS
SELECT 
  t.id,
  t.project_id,
  t.name as text,
  t.start_date as start_date,
  t.due_date as end_date,
  t.status,
  t.priority,
  t.progress,
  t.parent_task_id,
  p.name as project_name,
  a.name as assigned_to_name,
  CASE 
    WHEN t.status = 'completed' THEN 'completed'
    WHEN t.status = 'in_progress' THEN 'in_progress'
    WHEN t.due_date < CURRENT_DATE THEN 'overdue'
    ELSE 'pending'
  END as gantt_status
FROM tasks t
LEFT JOIN projects p ON p.id = t.project_id
LEFT JOIN agents a ON a.id = t.assigned_to;

-- Vista de resumen de proyecto
CREATE OR REPLACE VIEW project_summary_view AS
SELECT 
  p.*,
  c.first_name as client_first_name,
  c.last_name as client_last_name,
  c.company_name as client_company,
  a.name as manager_name,
  
  -- Métricas de tareas
  COUNT(t.id) as total_tasks,
  COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks,
  COUNT(CASE WHEN t.status = 'in_progress' THEN 1 END) as in_progress_tasks,
  COUNT(CASE WHEN t.status = 'todo' THEN 1 END) as pending_tasks,
  
  -- Métricas de tiempo
  COALESCE(SUM(te.duration_minutes), 0)/60 as total_hours_logged,
  
  -- Milestones
  COUNT(m.id) as total_milestones,
  COUNT(CASE WHEN m.status = 'completed' THEN 1 END) as completed_milestones,
  
  -- Presupuesto
  pb.total_budget,
  (pb.spent_labor + pb.spent_materials + pb.spent_services + pb.spent_overhead) as total_spent,
  
  -- Progreso calculado
  CASE 
    WHEN COUNT(t.id) > 0 
    THEN (COUNT(CASE WHEN t.status = 'completed' THEN 1 END)::float / COUNT(t.id)::float * 100)
    ELSE 0 
  END as calculated_progress

FROM projects p
LEFT JOIN contacts c ON c.id = p.client_id
LEFT JOIN agents a ON a.id = p.manager_id
LEFT JOIN tasks t ON t.project_id = p.id AND t.deleted_at IS NULL
LEFT JOIN time_entries te ON te.project_id = p.id
LEFT JOIN milestones m ON m.project_id = p.id
LEFT JOIN project_budgets pb ON pb.project_id = p.id
GROUP BY p.id, c.first_name, c.last_name, c.company_name, a.name, 
         pb.total_budget, pb.spent_labor, pb.spent_materials, pb.spent_services, pb.spent_overhead;

-- Vista de carga de recursos
CREATE OR REPLACE VIEW resource_workload_view AS
SELECT 
  a.id as agent_id,
  a.name as agent_name,
  a.email as agent_email,
  
  -- Proyectos asignados
  COUNT(DISTINCT ra.project_id) as active_projects,
  
  -- Tareas asignadas
  COUNT(DISTINCT t.id) as assigned_tasks,
  COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END) as completed_tasks,
  
  -- Horas esta semana
  COALESCE(SUM(CASE 
    WHEN te.start_time >= date_trunc('week', CURRENT_DATE) 
    AND te.start_time < date_trunc('week', CURRENT_DATE) + INTERVAL '7 days'
    THEN te.duration_minutes 
  END), 0)/60 as hours_this_week,
  
  -- Horas totales
  COALESCE(SUM(te.duration_minutes), 0)/60 as total_hours,
  
  -- Capacidad total asignada
  COALESCE(SUM(ra.allocation_percentage), 0) as total_allocation

FROM agents a
LEFT JOIN resource_allocations ra ON ra.agent_id = a.id 
  AND ra.start_date <= CURRENT_DATE 
  AND (ra.end_date IS NULL OR ra.end_date >= CURRENT_DATE)
LEFT JOIN tasks t ON t.assigned_to = a.id AND t.deleted_at IS NULL
LEFT JOIN time_entries te ON te.agent_id = a.id
GROUP BY a.id, a.name, a.email;

-- ============================================
-- TRIGGERS Y FUNCIONES
-- ============================================

-- Trigger: Actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_time_entries_updated_at ON time_entries;
CREATE TRIGGER update_time_entries_updated_at BEFORE UPDATE ON time_entries 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_milestones_updated_at ON milestones;
CREATE TRIGGER update_milestones_updated_at BEFORE UPDATE ON milestones 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_resource_allocations_updated_at ON resource_allocations;
CREATE TRIGGER update_resource_allocations_updated_at BEFORE UPDATE ON resource_allocations 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_project_budgets_updated_at ON project_budgets;
CREATE TRIGGER update_project_budgets_updated_at BEFORE UPDATE ON project_budgets 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Calcular duración automáticamente
CREATE OR REPLACE FUNCTION calculate_time_entry_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.end_time IS NOT NULL AND NEW.start_time IS NOT NULL THEN
    NEW.duration_minutes := EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time))/60;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calc_duration ON time_entries;
CREATE TRIGGER trigger_calc_duration 
BEFORE INSERT OR UPDATE OF start_time, end_time ON time_entries
FOR EACH ROW EXECUTE FUNCTION calculate_time_entry_duration();

-- Trigger: Actualizar progreso de proyecto basado en tareas
CREATE OR REPLACE FUNCTION update_project_progress()
RETURNS TRIGGER AS $$
DECLARE
  total_tasks INTEGER;
  completed_tasks INTEGER;
  new_progress INTEGER;
BEGIN
  -- Contar tareas del proyecto
  SELECT COUNT(*), COUNT(CASE WHEN status = 'completed' THEN 1 END)
  INTO total_tasks, completed_tasks
  FROM tasks 
  WHERE project_id = COALESCE(NEW.project_id, OLD.project_id) 
    AND deleted_at IS NULL;
  
  IF total_tasks > 0 THEN
    new_progress := (completed_tasks::float / total_tasks::float * 100)::integer;
    
    UPDATE projects 
    SET progress = new_progress,
        status = CASE 
          WHEN new_progress = 100 THEN 'completed'
          WHEN new_progress > 0 THEN 'in_progress'
          ELSE status
        END,
        updated_at = NOW()
    WHERE id = COALESCE(NEW.project_id, OLD.project_id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_project_progress ON tasks;
CREATE TRIGGER trigger_update_project_progress 
AFTER INSERT OR UPDATE OR DELETE ON tasks
FOR EACH ROW EXECUTE FUNCTION update_project_progress();

-- ============================================
-- RLS
-- ============================================

ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_time_entries ON time_entries;
CREATE POLICY allow_all_time_entries ON time_entries FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_milestones ON milestones;
CREATE POLICY allow_all_milestones ON milestones FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_task_deps ON task_dependencies;
CREATE POLICY allow_all_task_deps ON task_dependencies FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_resource_alloc ON resource_allocations;
CREATE POLICY allow_all_resource_alloc ON resource_allocations FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_project_budgets ON project_budgets;
CREATE POLICY allow_all_project_budgets ON project_budgets FOR ALL USING (true);
