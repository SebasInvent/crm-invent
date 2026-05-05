#!/usr/bin/env node
/**
 * aria-n8n-fix-respond.mjs
 *
 * Fixes a regression in the WhatsApp flow caused by adding the widget
 * branch: when the original Evolution Webhook fires, n8n complains
 *   "Unused Respond to Webhook node found in the workflow"
 * because the FALSE branch of `Es Widget?` never reaches the
 * `Respond to Widget` node.
 *
 * Strategy: every path through the workflow must end at a
 * respondToWebhook node, so add one — `Respond to Evolution` — at the
 * end of the WhatsApp branch (after Enviar WhatsApp). It returns a
 * trivial JSON ack so Evolution gets a real 200.
 *
 * Both webhook triggers are set to responseMode='responseNode' to
 * make this explicit.
 *
 * Idempotent.
 */

const { N8N_API_KEY, N8N_BASE_URL, N8N_WORKFLOW_ID } = process.env
function fail(m) { console.error('✗', m); process.exit(1) }
if (!N8N_API_KEY || !N8N_BASE_URL || !N8N_WORKFLOW_ID) fail('env vars required')

const baseUrl = N8N_BASE_URL.replace(/\/$/, '')
const headers = { 'X-N8N-API-KEY': N8N_API_KEY, 'Content-Type': 'application/json' }

console.log('→ Fetching workflow…')
const wfRes = await fetch(`${baseUrl}/api/v1/workflows/${N8N_WORKFLOW_ID}`, { headers })
if (!wfRes.ok) fail(`GET failed: ${wfRes.status}`)
const wf = await wfRes.json()

// 1. Set OLD Webhook to responseMode='responseNode'
const oldWebhook = wf.nodes.find(
  (n) => n.name === 'Webhook' && n.type === 'n8n-nodes-base.webhook',
)
if (oldWebhook && oldWebhook.parameters?.responseMode !== 'responseNode') {
  oldWebhook.parameters = {
    ...oldWebhook.parameters,
    responseMode: 'responseNode',
  }
  console.log('  ✓ Old Webhook set to responseMode=responseNode')
}

// 2. Add 'Respond to Evolution' node if missing
if (!wf.nodes.find((n) => n.name === 'Respond to Evolution')) {
  wf.nodes.push({
    parameters: {
      respondWith: 'json',
      responseBody:
        '={{ JSON.stringify({ ok: true, sent: !!$json.key, evolution: $json }) }}',
      options: {},
    },
    id: 'aria-respond-evolution',
    name: 'Respond to Evolution',
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1.1,
    position: [2752, -128],
  })
  console.log('  ✓ Added Respond to Evolution node')
}

// 3. Connect Enviar WhatsApp → Respond to Evolution
const conns = wf.connections
conns['Enviar WhatsApp'] = {
  main: [[{ node: 'Respond to Evolution', type: 'main', index: 0 }]],
}
console.log('  ✓ Wired Enviar WhatsApp → Respond to Evolution')

// 4. PUT back
const ALLOWED_SETTINGS = new Set([
  'executionOrder', 'saveDataErrorExecution', 'saveDataSuccessExecution',
  'saveExecutionProgress', 'saveManualExecutions', 'timezone',
  'executionTimeout', 'errorWorkflow',
])
const cleanSettings = Object.fromEntries(
  Object.entries(wf.settings ?? {}).filter(([k]) => ALLOWED_SETTINGS.has(k)),
)
const body = {
  name: wf.name,
  nodes: wf.nodes,
  connections: conns,
  settings: cleanSettings,
}
if (wf.staticData) body.staticData = wf.staticData

console.log('→ Pushing patched workflow…')
const updateRes = await fetch(`${baseUrl}/api/v1/workflows/${N8N_WORKFLOW_ID}`, {
  method: 'PUT',
  headers,
  body: JSON.stringify(body),
})
if (!updateRes.ok) fail(`PUT failed: ${updateRes.status} ${await updateRes.text()}`)
console.log('✓ Done.')
