#!/usr/bin/env node
/**
 * aria-n8n-add-widget.mjs
 *
 * Phase 2 of the audit: adds a CRM-widget chat trigger to the Aria
 * workflow so the floating widget at /api/aria/chat (in the CRM) can
 * reach the same agent + memory + tools that WhatsApp uses, without
 * disrupting the existing WhatsApp path.
 *
 * Topology after this runs:
 *
 *   Evolution Webhook → Parse Evolution → ...audio chain... → Registrar
 *   Entrante → Invent Asesor IA → Es Widget? IF
 *                                   ├─ true (widget) → Respond to Widget
 *                                   └─ false (whatsapp) → Preparar Respuesta
 *                                                          → Registrar Saliente
 *                                                          → Enviar WhatsApp
 *
 *   Webhook CRM Widget → Parse CRM Widget → Invent Asesor IA (same agent)
 *
 * Idempotent: if the widget nodes already exist, we don't re-add them.
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

console.log(`→ Fetching workflow ${N8N_WORKFLOW_ID}…`)
const wfRes = await fetch(`${baseUrl}/api/v1/workflows/${N8N_WORKFLOW_ID}`, { headers })
if (!wfRes.ok) fail(`GET failed: ${wfRes.status} ${await wfRes.text()}`)
const wf = await wfRes.json()
console.log(`  fetched "${wf.name}" with ${wf.nodes.length} nodes`)

const nodeNames = new Set(wf.nodes.map((n) => n.name))
const need = (n) => !nodeNames.has(n)

// ─── New nodes (only added if missing) ──────────────────────────────

const NEW_NODES = []

if (need('Webhook CRM Widget')) {
  NEW_NODES.push({
    parameters: {
      httpMethod: 'POST',
      path: 'aria-crm-widget',
      responseMode: 'responseNode',
      options: {},
    },
    id: 'aria-widget-webhook',
    name: 'Webhook CRM Widget',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: [-800, 720],
    webhookId: 'aria-crm-widget',
  })
}

if (need('Parse CRM Widget')) {
  NEW_NODES.push({
    parameters: {
      jsCode: `// Parse CRM widget body coming from /api/aria/chat
// Expected shape: { message, history, user: {id, email}, source, timestamp }
//
// We map it to the same shape the rest of the flow expects (Telefono,
// Nombre, Mensaje, sessionIdSafe, session_key) AND tag source='widget'
// so the post-agent IF can branch.
//
// SECURITY NOTE: we set Telefono = '573107556872' (Sebastián's phone)
// because the CRM widget is gated behind /api/aria/chat → requireAuth
// in the Next.js API. Only authenticated CRM users reach this webhook,
// and the only authenticated user today is Sebas. If we ever add
// multi-user, route based on user.email instead.

const items = $input.all();
const item = items[0]?.json || {};
const body = item.body || item;

const message = String(body.message || '').trim();
if (!message) {
  // Empty message — bail with an empty response payload so the
  // Respond to Widget node returns something sensible.
  return [{ json: { Telefono: '573107556872', Nombre: 'CRM', Mensaje: '', source: 'widget', skipAgent: true, _output: '(mensaje vacío)' } }];
}

const user = body.user || {};
const userId = String(user.id || 'anon');
const userEmail = String(user.email || 'sebas@invent');
const sessionKey = 'invent_widget:' + userId;

return [{
  json: {
    Telefono: '573107556872',
    Nombre: userEmail || 'Sebastián (CRM Widget)',
    Mensaje: message,
    isAudio: false,
    sessionIdSafe: 'widget-' + userId,
    session_key: sessionKey,
    source: 'widget',
  }
}];`,
    },
    id: 'aria-widget-parse',
    name: 'Parse CRM Widget',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [-560, 720],
  })
}

if (need('Es Widget?')) {
  NEW_NODES.push({
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [
          {
            leftValue: '={{ $json.source }}',
            rightValue: 'widget',
            operator: { type: 'string', operation: 'equals' },
          },
        ],
        combinator: 'and',
      },
      options: {},
    },
    id: 'aria-widget-if',
    name: 'Es Widget?',
    type: 'n8n-nodes-base.if',
    typeVersion: 2,
    position: [1376, 16],
  })
}

if (need('Respond to Widget')) {
  NEW_NODES.push({
    parameters: {
      respondWith: 'json',
      responseBody:
        '={{ JSON.stringify({ reply: $json.output || $json.text || \'(sin respuesta)\' }) }}',
      options: {},
    },
    id: 'aria-widget-respond',
    name: 'Respond to Widget',
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1.1,
    position: [1632, 240],
  })
}

if (NEW_NODES.length === 0) {
  console.log('✓ All widget nodes already exist — nothing to add.')
} else {
  console.log(`→ Adding ${NEW_NODES.length} new nodes:`)
  for (const n of NEW_NODES) console.log(`    + ${n.name}`)
}

// ─── Rewire connections ─────────────────────────────────────────────
//
// 1. Webhook CRM Widget → Parse CRM Widget → Invent Asesor IA
// 2. Invent Asesor IA → Es Widget?  (replaces direct → Preparar Respuesta)
// 3. Es Widget? .true  → Respond to Widget
// 4. Es Widget? .false → Preparar Respuesta
//
// We mutate the existing connections to redirect the agent's main
// output through the IF, but keep everything downstream intact.

const conns = wf.connections

// Helper: ensure src.main contains exactly one connection to dst
function setMain(src, dst) {
  const c = conns[src] ?? {}
  c.main = [[{ node: dst, type: 'main', index: 0 }]]
  conns[src] = c
}
function addBranch(src, branchIndex, dst) {
  const c = conns[src] ?? {}
  c.main = c.main ?? []
  while (c.main.length <= branchIndex) c.main.push([])
  c.main[branchIndex] = [{ node: dst, type: 'main', index: 0 }]
  conns[src] = c
}

// Widget chain (only if we added the trigger nodes)
if (need('Webhook CRM Widget') === false || nodeNames.has('Webhook CRM Widget')) {
  // either already there, or just added — set the wiring either way
}
setMain('Webhook CRM Widget', 'Parse CRM Widget')
setMain('Parse CRM Widget', 'Invent Asesor IA')

// Insert IF between Agent and Preparar Respuesta
setMain('Invent Asesor IA', 'Es Widget?')
addBranch('Es Widget?', 0, 'Respond to Widget')   // true → respond
addBranch('Es Widget?', 1, 'Preparar Respuesta')  // false → existing path

// ─── Push back ─────────────────────────────────────────────────────
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

const allNodes = [...wf.nodes, ...NEW_NODES]
const body = {
  name: wf.name,
  nodes: allNodes,
  connections: conns,
  settings: cleanSettings,
}
if (wf.staticData) body.staticData = wf.staticData

console.log('→ Pushing widget topology…')
const updateRes = await fetch(`${baseUrl}/api/v1/workflows/${N8N_WORKFLOW_ID}`, {
  method: 'PUT',
  headers,
  body: JSON.stringify(body),
})
if (!updateRes.ok) fail(`PUT failed (${updateRes.status}): ${await updateRes.text()}`)

console.log('✓ Done.')
console.log()
console.log('Widget URL: https://lab.inventagency.co/webhook/aria-crm-widget')
console.log('Set in Vercel:')
console.log('  ARIA_WEBHOOK_URL = https://lab.inventagency.co/webhook/aria-crm-widget')
