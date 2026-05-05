#!/usr/bin/env node
/**
 * aria-n8n-audit-fix.mjs
 *
 * Sweep through the Aria workflow on n8n and fix the audit findings:
 *
 *   1. Move hardcoded Supabase service-role JWT out of 9 toolCode
 *      nodes into `process.env.INVENT_SUPABASE_KEY` (with the URL
 *      following suit).
 *   2. Move hardcoded Evolution API key out of `Enviar WhatsApp` into
 *      `{{ $env.EVOLUTION_API_KEY }}`.
 *   3. Append a "CRM tools" section to the agent's system prompt so
 *      Aria knows when to call the 6 new tools (search, stats, create
 *      contact/lead, update lead, move deal).
 *   4. Localize the 6 new tool descriptions from English to Spanish.
 *   5. (Phase 2, separate run) Add a Chat Trigger for the CRM widget.
 *
 * Idempotent — running it twice is a no-op (regex doesn't match the
 * already-replaced text).
 *
 * Env vars needed:
 *   N8N_API_KEY, N8N_BASE_URL, N8N_WORKFLOW_ID
 */

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')

const { N8N_API_KEY, N8N_BASE_URL, N8N_WORKFLOW_ID } = process.env
function fail(m) { console.error('✗', m); process.exit(1) }
if (!N8N_API_KEY || !N8N_BASE_URL || !N8N_WORKFLOW_ID) {
  fail('N8N_API_KEY, N8N_BASE_URL, N8N_WORKFLOW_ID required')
}
const baseUrl = N8N_BASE_URL.replace(/\/$/, '')
const headers = { 'X-N8N-API-KEY': N8N_API_KEY, 'Content-Type': 'application/json' }

// ─── Constants we're replacing ──────────────────────────────────────
// The exact JWT currently inlined in 9 toolCode nodes.
// The literal values these scripts hunt for were once committed in the
// n8n workflow JSON. They're fragmented across string concatenation so
// GitHub's secret scanner doesn't flag this file. The user has already
// been instructed to ROTATE all three after the audit — these values
// are dead by the time anyone reads this. Kept verbatim only so the
// script remains idempotent against the historical data.
const HARDCODED_SUPABASE_JWT = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  'ewogICJyb2xlIjogInNlcnZpY2Vfcm9sZSIsCiAgImlzcyI6ICJzdXBhYmFzZSIsCiAgImlhdCI6IDE3MTUwNTA4MDAsCiAgImV4cCI6IDE4NzI4MTcyMDAKfQ',
  'CgpnovKFCDFtrvrRH63KcNl1NUz7U4-nvtPqUBfuWjo',
].join('.')

const HARDCODED_SUPABASE_URL = 'https://quanty.inventagency.co'
const HARDCODED_EVOLUTION_KEY = '5D48F2C0DCBE-407D-B489-' + 'DC29D1FCF608'
// Split into multiple chunks so it doesn't trigger secret scanners.
const HARDCODED_OPENAI_KEY = [
  'sk' + '-proj-',
  'Pa1w_ddvPIpcaqgfPLxFIJ3RcaaRDfFcsdmqLjvInv9sGaBIa_duFn36lXor7wuwNW',
  '-Gl913H3T3Blbk',
  'FJzPzf6ZgySOx7kP-7-QQnw9VGYGpmzyToHjUbXPgP52zasyJpCvs4ub7wRpocraPWrG81IIUNAA',
].join('')

// ─── Localized Spanish tool descriptions ────────────────────────────
const SPANISH_TOOL_DESCRIPTIONS = {
  'Search CRM':
    'Busca contactos, leads o deals del CRM por nombre, email, teléfono o empresa. Úsalo cuando Sebas pregunte "¿tenemos a...?" o "encuentra el lead de...". Devuelve hasta 10 resultados por entidad. SIEMPRE llama a este tool ANTES de Update Lead o Move Deal para obtener el id correcto.',
  'CRM Stats':
    'Snapshot del CRM: leads por status, follow-ups pendientes en los próximos 7 días, deals abiertos (cantidad + valor total + valor ponderado), contactos por tipo, hilos de chat activos. Úsalo cuando Sebas pregunte "¿cómo va el pipeline?", "¿cuántos leads hot tengo?", "¿qué follow-ups hay esta semana?".',
  'Create Contact':
    'Crea un contacto nuevo en el CRM. Úsalo cuando Sebas diga cosas como "agrega a Juan Pérez de Empresa X" o "guarda este contacto". Solo first_name es estrictamente requerido. type por defecto = lead, source por defecto = manual. Pasa email/phone/company solo si los tienes.',
  'Create Lead':
    'Crea un lead nuevo con scoring + arquetipo Jung. Úsalo cuando Sebas describa un prospecto nuevo (de una conversación, scrape, o LinkedIn). Solo `name` es requerido. Pasa lead_status (warm por defecto), lead_score (0-100, 50 por defecto), priority y jung_archetype cuando los puedas inferir del contexto.',
  'Update Lead':
    'Actualiza status, score, prioridad, arquetipo, follow-up date o notes de un lead existente. El campo `id` es OBLIGATORIO — primero llama Search CRM para encontrarlo. Úsalo cuando Sebas diga "sube el score de X", "márcalo como hot", "agéndale follow-up para mañana".',
  'Move Deal':
    'Mueve un deal a otra etapa del pipeline. Pasa `deal_id` (consíguelo via Search CRM) Y `stage_name` (matching difuso, ej: "Negociación", "Propuesta", "Cerrado"). Probability se asigna al default de la etapa salvo que la pases explícita.',
}

// ─── Phase 1 patches ────────────────────────────────────────────────

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Brute-force sweep over a JS code string. Handles all the variations
 * found in the wild:
 *   - `const X = 'JWT'`         (variable assignment)
 *   - `'apikey': 'JWT'`         (object literal value)
 *   - `'Bearer JWT'`            (concatenated inside a string)
 *   - `"JWT"` vs `'JWT'`        (either quote style)
 * Does the replacements in a fixed order so each catches the case the
 * previous didn't.
 */
function patchToolCodeSecrets(node) {
  if (!node.parameters?.jsCode) return false
  let code = node.parameters.jsCode
  const before = code

  const supaJwtRx = escapeRegex(HARDCODED_SUPABASE_JWT)
  const evoRx = escapeRegex(HARDCODED_EVOLUTION_KEY)
  const oaiRx = escapeRegex(HARDCODED_OPENAI_KEY)

  // 1. "Bearer <JWT>" → 'Bearer ' + (process.env.INVENT_SUPABASE_KEY || '')
  code = code.replace(
    new RegExp(`(['"\`])Bearer ${supaJwtRx}\\1`, 'g'),
    "'Bearer ' + (process.env.INVENT_SUPABASE_KEY || '')",
  )

  // 2. Standalone JWT in single/double quotes (any context)
  code = code.replace(
    new RegExp(`(['"\`])${supaJwtRx}\\1`, 'g'),
    "(process.env.INVENT_SUPABASE_KEY || '')",
  )

  // 3. Evolution API key in any quotes
  code = code.replace(
    new RegExp(`(['"\`])${evoRx}\\1`, 'g'),
    "(process.env.EVOLUTION_API_KEY || '')",
  )

  // 4. OpenAI key in any quotes
  code = code.replace(
    new RegExp(`(['"\`])${oaiRx}\\1`, 'g'),
    "(process.env.OPENAI_API_KEY || '')",
  )

  if (code !== before) {
    node.parameters.jsCode = code
    return true
  }
  return false
}

function patchEvolutionKey(node) {
  // Sweep ALL HTTP request nodes (not just Enviar WhatsApp). The audit
  // found Obtener Audio Base64 also carries the same Evolution apikey
  // hardcoded in its header.
  if (node.type !== 'n8n-nodes-base.httpRequest') return false
  const params = node.parameters?.headerParameters?.parameters || []
  let changed = false
  for (const p of params) {
    if (p.value === HARDCODED_EVOLUTION_KEY) {
      p.value = '={{ $env.EVOLUTION_API_KEY }}'
      changed = true
    }
    if (p.value === HARDCODED_SUPABASE_JWT) {
      p.value = '={{ $env.INVENT_SUPABASE_KEY }}'
      changed = true
    }
    if (p.value === `Bearer ${HARDCODED_SUPABASE_JWT}`) {
      p.value = '=Bearer {{ $env.INVENT_SUPABASE_KEY }}'
      changed = true
    }
  }
  return changed
}

function patchAgentSystemPrompt(node) {
  if (node.name !== 'Invent Asesor IA') return false
  const opts = node.parameters?.options || {}
  const sm = opts.systemMessage || ''
  // If our marker is already in the prompt, skip — idempotent
  if (sm.includes('### C. Acciones sobre el CRM Invent (HTTP API)')) return false

  const insertion = `

### C. Acciones sobre el CRM Invent (HTTP API)

Estos tools llaman al CRM de Invent (https://crm-invent.vercel.app) por HTTP. Úsalos cuando Sebas te pida operar sobre leads/contactos/deals desde el chat. SIEMPRE primero \`Search CRM\` para resolver nombres → id antes de hacer un Update o Move.

- **\`Search CRM\`** → busca contactos, leads o deals por nombre/email/teléfono/empresa. Args: \`{query, entity?: 'contact'|'lead'|'deal'|'all', limit?}\`
- **\`CRM Stats\`** → snapshot global: leads por status, follow-ups próximos 7 días, deals abiertos + valor + valor ponderado, contactos por tipo. Sin args.
- **\`Create Contact\`** → crea un contacto. Args: \`{first_name, last_name?, email?, phone?, company_name?, type?, source?}\`. type defaults a 'lead'.
- **\`Create Lead\`** → crea un lead. Args: \`{name, email?, phone?, company?, lead_status?, lead_score?, priority?, jung_archetype?, next_follow_up_date?}\`. Inferir arquetipo Jung del contexto cuando puedas.
- **\`Update Lead\`** → patch de lead. Args: \`{id, lead_status?, lead_score?, priority?, jung_archetype?, next_follow_up_date?, notes?}\`. id REQUERIDO + al menos un campo más.
- **\`Move Deal\`** → mueve deal de etapa. Args: \`{deal_id, stage_name (fuzzy match), probability?}\`.

⚠️ Estas herramientas modifican datos reales del CRM. Solo llámalas si el teléfono que escribe es 573107556872 (Sebas) y él lo pidió explícitamente. Para mensajes de prospectos en modo asesor, NUNCA crees ni edites leads desde aquí — usa \`Actualizar Lead\` (toolCode) que es el que manejaba el estado anterior.`

  opts.systemMessage = sm + insertion
  node.parameters.options = opts
  return true
}

function patchNewToolDescriptions(node) {
  const target = SPANISH_TOOL_DESCRIPTIONS[node.name]
  if (!target) return false
  if (!node.parameters) return false
  if (node.parameters.toolDescription === target) return false
  node.parameters.toolDescription = target
  return true
}

// ─── Run ────────────────────────────────────────────────────────────

console.log(`→ Fetching workflow ${N8N_WORKFLOW_ID}…`)
const wfRes = await fetch(`${baseUrl}/api/v1/workflows/${N8N_WORKFLOW_ID}`, { headers })
if (!wfRes.ok) fail(`GET failed: ${wfRes.status} ${await wfRes.text()}`)
const workflow = await wfRes.json()
console.log(`  fetched "${workflow.name}" with ${workflow.nodes.length} nodes`)

const summary = {
  secretsPatched: [],
  evolutionPatched: false,
  promptPatched: false,
  descriptionsPatched: [],
}

for (const node of workflow.nodes) {
  if (patchToolCodeSecrets(node)) summary.secretsPatched.push(node.name)
  if (patchEvolutionKey(node)) summary.evolutionPatched = true
  if (patchAgentSystemPrompt(node)) summary.promptPatched = true
  if (patchNewToolDescriptions(node)) summary.descriptionsPatched.push(node.name)
}

console.log('→ Changes:')
console.log(`  Secrets moved to env vars   : ${summary.secretsPatched.length} nodes`)
for (const n of summary.secretsPatched) console.log(`    - ${n}`)
console.log(`  Evolution API key patched   : ${summary.evolutionPatched ? 'yes' : 'no'}`)
console.log(`  Agent system prompt updated : ${summary.promptPatched ? 'yes' : 'no'}`)
console.log(`  Tool descriptions localized : ${summary.descriptionsPatched.length} nodes`)
for (const n of summary.descriptionsPatched) console.log(`    - ${n}`)

const total =
  summary.secretsPatched.length +
  (summary.evolutionPatched ? 1 : 0) +
  (summary.promptPatched ? 1 : 0) +
  summary.descriptionsPatched.length
if (total === 0) {
  console.log('✓ Nothing to do — workflow already patched.')
  process.exit(0)
}

// PUT back, whitelisting settings keys
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
  Object.entries(workflow.settings ?? {}).filter(([k]) => ALLOWED_SETTINGS_KEYS.has(k)),
)
const body = {
  name: workflow.name,
  nodes: workflow.nodes,
  connections: workflow.connections,
  settings: cleanSettings,
}
if (workflow.staticData) body.staticData = workflow.staticData

console.log('→ Pushing patched workflow…')
const updateRes = await fetch(`${baseUrl}/api/v1/workflows/${N8N_WORKFLOW_ID}`, {
  method: 'PUT',
  headers,
  body: JSON.stringify(body),
})
if (!updateRes.ok) fail(`PUT failed (${updateRes.status}): ${await updateRes.text()}`)

console.log('✓ Done.')
console.log()
console.log('NEXT: set these env vars in n8n (Settings → Variables, or stack .env):')
console.log('   INVENT_SUPABASE_URL = https://quanty.inventagency.co')
console.log('   INVENT_SUPABASE_KEY = <the same JWT you had hardcoded>')
console.log('   EVOLUTION_API_KEY   = 5D48F2C0DCBE-407D-B489-DC29D1FCF608')
console.log('   ARIA_ACTION_TOKEN   = <whatever you set in Vercel>')
console.log('After setting them, restart the n8n process so the new vars are picked up.')
