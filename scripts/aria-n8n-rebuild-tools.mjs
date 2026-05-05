#!/usr/bin/env node
/**
 * aria-n8n-rebuild-tools.mjs
 *
 * After PUT-ing the original tool definitions, n8n's schema validator
 * silently rewrote the parameter shape and dropped most of our config:
 *   - `headerParameters.parameters` → `parametersHeaders.values[{}]`
 *   - `queryParameters.parameters`  → `parametersQuery.values[{}]`
 *   - `method` got stripped on GET tools (defaulted)
 *
 * The surviving placeholders are empty objects, so every tool effectively
 * has no Authorization header and no real query/body. Tool calls fail
 * validation because the LangChain agent receives an empty schema.
 *
 * Fix: re-set all 6 tool nodes' `parameters` using n8n's expected
 * keypair shape: `parametersHeaders.values[{name,value}]`,
 * `parametersQuery.values[{name,value}]`. PUT the whole workflow back.
 *
 * Idempotent: re-running just re-asserts the canonical shape.
 *
 * Env: N8N_API_KEY, N8N_BASE_URL, N8N_WORKFLOW_ID
 */

const { N8N_API_KEY, N8N_BASE_URL, N8N_WORKFLOW_ID } = process.env
function fail(m) { console.error('✗', m); process.exit(1) }
if (!N8N_API_KEY || !N8N_BASE_URL || !N8N_WORKFLOW_ID) {
  fail('N8N_API_KEY, N8N_BASE_URL, N8N_WORKFLOW_ID required')
}
const baseUrl = N8N_BASE_URL.replace(/\/$/, '')
const headers = { 'X-N8N-API-KEY': N8N_API_KEY, 'Content-Type': 'application/json' }

// ─── Canonical tool definitions ─────────────────────────────────────
//
// IMPORTANT shape notes for `@n8n/n8n-nodes-langchain.toolHttpRequest`:
//
//   - `parametersHeaders.values` is the keypair list (each entry has
//     `name` + `value`). NOT `headerParameters.parameters`.
//   - `parametersQuery.values` similarly.
//   - `placeholderDefinitions.values` declares the $fromAI parameters
//     so the LLM gets a well-typed schema. Without this, n8n falls
//     back to a generic { input: any } schema and validation can be
//     flaky.
//   - For tools with NO inputs (CRM Stats), we add a single dummy
//     placeholder so the auto-generated schema is sane.

// `valueProvider: 'fieldValue'` tells n8n's toolHttpRequest to USE THE
// LITERAL VALUE rather than expose this header as a parameter for the
// LLM to fill. Without it, the LLM sees `Authorization` as a parameter
// it should generate and produces placeholders like "Bearer
// YOUR_AUTH_TOKEN" — the real token from $env never reaches the request.
const AUTH_HEADER = {
  name: 'Authorization',
  valueProvider: 'fieldValue',
  value: '=Bearer {{ $env.ARIA_ACTION_TOKEN }}',
}
const CT_HEADER = {
  name: 'Content-Type',
  valueProvider: 'fieldValue',
  value: 'application/json',
}

const TOOL_DEFS = {
  'Search CRM': {
    toolDescription:
      'Busca contactos, leads o deals del CRM por nombre, email, teléfono o empresa. Úsalo cuando Sebas pregunte "¿tenemos a...?" o "encuentra el lead de...". Devuelve hasta 10 resultados por entidad. SIEMPRE llama a este tool ANTES de Update Lead o Move Deal para obtener el id correcto.',
    method: 'GET',
    url: 'https://crm-invent.vercel.app/api/aria/actions/search',
    authentication: 'none',
    sendQuery: true,
    specifyQuery: 'keypair',
    parametersQuery: {
      values: [
        {
          name: 'q',
          valueProvider: 'modelRequired',
          value: '',
          description: 'Search term (name, email, phone, or company)',
        },
        {
          name: 'entity',
          valueProvider: 'modelOptional',
          value: '',
          description: 'One of: contact, lead, deal, all (default all)',
        },
        {
          name: 'limit',
          valueProvider: 'modelOptional',
          value: '',
          description: 'Max matches per entity (1-20, default 8)',
        },
      ],
    },
    sendHeaders: true,
    specifyHeaders: 'keypair',
    parametersHeaders: { values: [AUTH_HEADER] },
    sendBody: false,
    options: {},
  },

  'CRM Stats': {
    toolDescription:
      'Snapshot del CRM: leads por status, follow-ups pendientes en los próximos 7 días, deals abiertos (cantidad + valor total + valor ponderado), contactos por tipo, hilos de chat activos. Úsalo cuando Sebas pregunte "¿cómo va el pipeline?", "¿cuántos leads hot tengo?", "¿qué follow-ups hay esta semana?".',
    method: 'GET',
    url: 'https://crm-invent.vercel.app/api/aria/actions/stats',
    authentication: 'none',
    // No-arg tool. Add a model-optional `reason` query param so the
    // LLM has something to fill, satisfying the schema validator
    // without affecting the call (the API ignores unknown query
    // params).
    sendQuery: true,
    specifyQuery: 'keypair',
    parametersQuery: {
      values: [
        {
          name: 'reason',
          valueProvider: 'modelOptional',
          value: '',
          description: 'Brief context for asking (logged server-side)',
        },
      ],
    },
    sendHeaders: true,
    specifyHeaders: 'keypair',
    parametersHeaders: { values: [AUTH_HEADER] },
    sendBody: false,
    options: {},
  },

  'Create Contact': {
    toolDescription:
      'Crea un contacto nuevo en el CRM. Úsalo cuando Sebas diga "agrega a Juan Pérez de Empresa X" o "guarda este contacto". Solo first_name es estrictamente requerido. type por defecto = lead, source por defecto = manual.',
    method: 'POST',
    url: 'https://crm-invent.vercel.app/api/aria/actions/contacts/create',
    authentication: 'none',
    sendQuery: false,
    sendHeaders: true,
    specifyHeaders: 'keypair',
    parametersHeaders: { values: [AUTH_HEADER, CT_HEADER] },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={
  "first_name": {{ JSON.stringify($fromAI('first_name', 'Contact first name (required)', 'string')) }},
  "last_name": {{ JSON.stringify($fromAI('last_name', 'Contact last name', 'string', '')) }},
  "email": {{ JSON.stringify($fromAI('email', 'Contact email', 'string', '')) || 'null' }},
  "phone": {{ JSON.stringify($fromAI('phone', 'Contact phone', 'string', '')) || 'null' }},
  "company_name": {{ JSON.stringify($fromAI('company_name', 'Company', 'string', '')) || 'null' }},
  "type": {{ JSON.stringify($fromAI('type', 'lead | prospect | customer | partner | supplier (default lead)', 'string', 'lead')) }},
  "source": {{ JSON.stringify($fromAI('source', 'manual | telegram | referral | linkedin (default manual)', 'string', 'manual')) }}
}`,
    options: {},
  },

  'Create Lead': {
    toolDescription:
      'Crea un lead nuevo con scoring + arquetipo Jung. Úsalo cuando Sebas describa un prospecto nuevo (de una conversación, scrape, o LinkedIn). Solo `name` es requerido. Inferir lead_status y jung_archetype del contexto cuando puedas.',
    method: 'POST',
    url: 'https://crm-invent.vercel.app/api/aria/actions/leads/create',
    authentication: 'none',
    sendQuery: false,
    sendHeaders: true,
    specifyHeaders: 'keypair',
    parametersHeaders: { values: [AUTH_HEADER, CT_HEADER] },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={
  "name": {{ JSON.stringify($fromAI('name', 'Lead full name (required)', 'string')) }},
  "email": {{ JSON.stringify($fromAI('email', 'Lead email', 'string', '')) || 'null' }},
  "phone": {{ JSON.stringify($fromAI('phone', 'Lead phone', 'string', '')) || 'null' }},
  "company": {{ JSON.stringify($fromAI('company', 'Lead company', 'string', '')) || 'null' }},
  "jung_archetype": {{ JSON.stringify($fromAI('jung_archetype', 'hero_entrepreneur | sage_conservative | caregiver_stressed | artist_specialist | ruler_executive | explorer_merchant', 'string', '')) || 'null' }},
  "lead_status": {{ JSON.stringify($fromAI('lead_status', 'hot | warm | cold | dead | converted (default warm)', 'string', 'warm')) }},
  "lead_score": {{ $fromAI('lead_score', 'Score 0-100 (default 50)', 'number', 50) }},
  "priority": {{ JSON.stringify($fromAI('priority', 'critical | high | medium | low (default medium)', 'string', 'medium')) }}
}`,
    options: {},
  },

  'Update Lead': {
    toolDescription:
      'Actualiza status, score, prioridad, arquetipo, follow-up date o notes de un lead existente. El campo `id` es OBLIGATORIO — primero llama Search CRM para encontrarlo. Úsalo cuando Sebas diga "sube el score de X", "márcalo como hot", "agéndale follow-up para mañana".',
    method: 'PATCH',
    url: 'https://crm-invent.vercel.app/api/aria/actions/leads/update',
    authentication: 'none',
    sendQuery: false,
    sendHeaders: true,
    specifyHeaders: 'keypair',
    parametersHeaders: { values: [AUTH_HEADER, CT_HEADER] },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={
  "id": {{ JSON.stringify($fromAI('id', 'Lead UUID — get it from Search CRM first', 'string')) }},
  "lead_status": {{ JSON.stringify($fromAI('lead_status', 'hot | warm | cold | dead | converted (omit if not changing)', 'string', '')) || 'null' }},
  "lead_score": {{ $fromAI('lead_score', 'New score 0-100 (omit if not changing)', 'number', 0) || 'null' }},
  "priority": {{ JSON.stringify($fromAI('priority', 'critical | high | medium | low (omit if not changing)', 'string', '')) || 'null' }},
  "next_follow_up_date": {{ JSON.stringify($fromAI('next_follow_up_date', 'ISO 8601 (omit if not setting)', 'string', '')) || 'null' }},
  "notes": {{ JSON.stringify($fromAI('notes', 'Free-form notes (omit if not changing)', 'string', '')) || 'null' }}
}`,
    options: {},
  },

  'Move Deal': {
    toolDescription:
      'Mueve un deal a otra etapa del pipeline. Pasa `deal_id` (consíguelo via Search CRM) Y `stage_name` (matching difuso, ej: "Negociación", "Propuesta", "Cerrado"). Probability se asigna al default de la etapa salvo que la pases explícita.',
    method: 'POST',
    url: 'https://crm-invent.vercel.app/api/aria/actions/deals/move',
    authentication: 'none',
    sendQuery: false,
    sendHeaders: true,
    specifyHeaders: 'keypair',
    parametersHeaders: { values: [AUTH_HEADER, CT_HEADER] },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={
  "deal_id": {{ JSON.stringify($fromAI('deal_id', 'Deal UUID — get from Search CRM first', 'string')) }},
  "stage_name": {{ JSON.stringify($fromAI('stage_name', 'Stage name to move to (e.g. Negociación, Propuesta, Cerrado)', 'string', '')) || 'null' }},
  "probability": {{ $fromAI('probability', 'Override probability 0-100 (optional)', 'number', 0) || 'null' }}
}`,
    options: {},
  },
}

// ─── Run ────────────────────────────────────────────────────────────

console.log(`→ Fetching workflow ${N8N_WORKFLOW_ID}…`)
const wfRes = await fetch(`${baseUrl}/api/v1/workflows/${N8N_WORKFLOW_ID}`, { headers })
if (!wfRes.ok) fail(`GET failed: ${wfRes.status} ${await wfRes.text()}`)
const wf = await wfRes.json()

let updated = 0
for (const node of wf.nodes) {
  const def = TOOL_DEFS[node.name]
  if (!def) continue
  node.parameters = def
  // Bump typeVersion to current to ensure n8n uses the latest schema
  node.typeVersion = 1.1
  updated++
}
console.log(`→ Rewrote ${updated} tool nodes with canonical schema`)

const ALLOWED_SETTINGS_KEYS = new Set([
  'executionOrder',
  'saveDataErrorExecution',
  'saveDataSuccessExecution',
  'saveExecutionProgress',
  'saveManualExecutions',
  'timezone',
  'executionTimeout',
  'errorWorkflow',
])
const cleanSettings = Object.fromEntries(
  Object.entries(wf.settings ?? {}).filter(([k]) => ALLOWED_SETTINGS_KEYS.has(k)),
)
const body = {
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings: cleanSettings,
}
if (wf.staticData) body.staticData = wf.staticData

console.log('→ Pushing rebuilt tool nodes…')
const updateRes = await fetch(`${baseUrl}/api/v1/workflows/${N8N_WORKFLOW_ID}`, {
  method: 'PUT',
  headers,
  body: JSON.stringify(body),
})
if (!updateRes.ok) fail(`PUT failed (${updateRes.status}): ${await updateRes.text()}`)
console.log('✓ Done.')
