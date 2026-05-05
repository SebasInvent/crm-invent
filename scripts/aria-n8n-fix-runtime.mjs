#!/usr/bin/env node
/**
 * aria-n8n-fix-runtime.mjs
 *
 * Two fixes after the smoke test exposed runtime issues:
 *
 *   A) `process.env.X` is BLOCKED in n8n Code-node sandbox. Replace
 *      every `process.env.X` with `$env.X` (n8n's exposed env reader
 *      for Code nodes).
 *
 *   B) The `Es Widget?` IF read `$json.source`, but the LangChain agent
 *      strips upstream input keys — by the time the IF runs, $json is
 *      just `{ output: '...' }`. Solution: insert a tiny Code node
 *      `Tag Source` between the agent and the IF that uses try/catch
 *      to detect which upstream parser executed and tags the output
 *      with `source: 'widget'|'whatsapp'`.
 *
 * Idempotent.
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

const summary = {
  envFixed: [],
  tagSourceAdded: false,
  ifUpdated: false,
}

// ─── Fix A: process.env → $env in all Code nodes ────────────────────
for (const node of wf.nodes) {
  if (!node.parameters?.jsCode) continue
  const before = node.parameters.jsCode
  // Replace `process.env.NAME` with `$env.NAME`. n8n Code node exposes
  // $env as a read-only object of process env vars.
  const after = before.replace(/\bprocess\.env\b/g, '$env')
  if (after !== before) {
    node.parameters.jsCode = after
    summary.envFixed.push(node.name)
  }
}

// ─── Fix B: insert Tag Source node ─────────────────────────────────
const hasTagSource = wf.nodes.find((n) => n.name === 'Tag Source')
if (!hasTagSource) {
  wf.nodes.push({
    parameters: {
      jsCode: `// Detect whether this run came from the CRM widget or WhatsApp.
// We use try/catch because $('NodeName').first() throws if the
// node didn't execute in this run.
let source = 'whatsapp';
try {
  const widget = $('Parse CRM Widget').first();
  if (widget?.json) source = 'widget';
} catch (e) {
  // Widget parser didn't run → WhatsApp path
}
const incoming = $input.first()?.json || {};
return [{ json: { ...incoming, source } }];`,
    },
    id: 'aria-tag-source',
    name: 'Tag Source',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1232, 16],
  })
  summary.tagSourceAdded = true
}

// ─── Update IF condition + connections ─────────────────────────────
// Before: Agent → Es Widget? → (true) Respond to Widget / (false) Preparar
// After:  Agent → Tag Source → Es Widget? → (true) Respond to Widget / (false) Preparar
const conns = wf.connections

// Re-route Agent → Tag Source → Es Widget?
conns['Invent Asesor IA'] = { main: [[{ node: 'Tag Source', type: 'main', index: 0 }]] }
conns['Tag Source'] = { main: [[{ node: 'Es Widget?', type: 'main', index: 0 }]] }
// Es Widget? branches stay the same

// Make sure the IF expression reads $json.source (it already does
// from Phase 2, but re-set defensively in case of partial runs)
const ifNode = wf.nodes.find((n) => n.name === 'Es Widget?')
if (ifNode) {
  ifNode.parameters = {
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
  }
  summary.ifUpdated = true
}

console.log('→ Changes:')
console.log(`  process.env → $env (Code nodes) : ${summary.envFixed.length} nodes`)
for (const n of summary.envFixed) console.log(`    - ${n}`)
console.log(`  Tag Source node added           : ${summary.tagSourceAdded ? 'yes' : 'no (already present)'}`)
console.log(`  IF condition refreshed          : ${summary.ifUpdated ? 'yes' : 'no'}`)

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
if (!updateRes.ok) fail(`PUT failed (${updateRes.status}): ${await updateRes.text()}`)
console.log('✓ Done.')
