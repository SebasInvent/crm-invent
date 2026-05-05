#!/usr/bin/env node
/**
 * aria-n8n-install.mjs
 *
 * Patches an existing n8n workflow to add Aria's 6 CRM action tool
 * nodes (defined in docs/aria-n8n/aria-tools-nodes.json).
 *
 * Usage (from repo root):
 *
 *   N8N_API_KEY=...           \
 *   N8N_BASE_URL=https://lab.inventagency.co \
 *   N8N_WORKFLOW_ID=OWhhT1r17wh14if7 \
 *   node scripts/aria-n8n-install.mjs
 *
 * What it does:
 *
 *   1. Fetches the existing workflow from n8n.
 *   2. Reads the tool nodes from docs/aria-n8n/aria-tools-nodes.json
 *   3. Skips any tool whose `id` already exists in the workflow
 *      (idempotent — safe to re-run).
 *   4. Finds the first AI Agent node in the workflow (looks for
 *      type containing 'agent') and wires each new tool to its
 *      `ai_tool` input.
 *   5. PATCHes the workflow back to n8n.
 *
 * If anything is ambiguous (e.g. multiple agents), it prints a clear
 * error so you can fix manually instead of guessing wrong.
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')
const TOOLS_JSON = join(REPO_ROOT, 'docs', 'aria-n8n', 'aria-tools-nodes.json')

const { N8N_API_KEY, N8N_BASE_URL, N8N_WORKFLOW_ID } = process.env

function fail(msg) {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

if (!N8N_API_KEY) fail('N8N_API_KEY not set. Get one from n8n → Settings → API.')
if (!N8N_BASE_URL) fail('N8N_BASE_URL not set. Example: https://lab.inventagency.co')
if (!N8N_WORKFLOW_ID) fail('N8N_WORKFLOW_ID not set. Get from the workflow URL.')

const baseUrl = N8N_BASE_URL.replace(/\/$/, '')
const headers = {
  'X-N8N-API-KEY': N8N_API_KEY,
  'Content-Type': 'application/json',
}

console.log(`→ Fetching workflow ${N8N_WORKFLOW_ID} from ${baseUrl}…`)
const wfRes = await fetch(`${baseUrl}/api/v1/workflows/${N8N_WORKFLOW_ID}`, { headers })
if (!wfRes.ok) {
  const text = await wfRes.text().catch(() => '')
  fail(`n8n returned ${wfRes.status}: ${text.slice(0, 400)}`)
}
const workflow = await wfRes.json()
console.log(`  fetched "${workflow.name}" with ${workflow.nodes?.length ?? 0} nodes`)

console.log(`→ Loading tool nodes from ${TOOLS_JSON}…`)
const toolsFile = JSON.parse(await readFile(TOOLS_JSON, 'utf8'))
const newTools = toolsFile.nodes
console.log(`  found ${newTools.length} tools to add`)

// Find the first agent node — n8n uses '@n8n/n8n-nodes-langchain.agent'
const agentNode = workflow.nodes.find((n) =>
  String(n.type || '').includes('agent'),
)
if (!agentNode) {
  fail(
    'No AI Agent node found in the workflow. Make sure the Aria agent ' +
    'is created with the n8n Langchain Agent node.',
  )
}
console.log(`  → wiring tools to agent node "${agentNode.name}"`)

// Idempotent: skip tools whose id is already on the canvas
const existingIds = new Set(workflow.nodes.map((n) => n.id))
const toAdd = newTools.filter((n) => !existingIds.has(n.id))
const skipped = newTools.length - toAdd.length
if (skipped > 0) {
  console.log(`  (${skipped} tools already present — skipping those)`)
}
if (toAdd.length === 0) {
  console.log('✓ Nothing to do — all tools already installed.')
  process.exit(0)
}

// Build connections from each new tool to the agent
const connections = workflow.connections ?? {}
for (const tool of toAdd) {
  const existing = connections[tool.name] ?? {}
  const aiTool = existing.ai_tool ?? []
  // Connection: each tool's `ai_tool` output → agent's `ai_tool` input
  aiTool.push([
    {
      node: agentNode.name,
      type: 'ai_tool',
      index: 0,
    },
  ])
  connections[tool.name] = { ...existing, ai_tool: aiTool }
}

const updated = {
  ...workflow,
  nodes: [...workflow.nodes, ...toAdd],
  connections,
}

// n8n's PUT validator rejects unknown keys in `settings` (the GET
// response sometimes includes things like callerPolicy that the
// PUT schema doesn't accept). Whitelist only documented keys and
// drop the rest. staticData is also flaky — only include if non-null.
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
  Object.entries(updated.settings ?? {}).filter(([k]) => ALLOWED_SETTINGS_KEYS.has(k)),
)

const body = {
  name: updated.name,
  nodes: updated.nodes,
  connections: updated.connections,
  settings: cleanSettings,
}
if (updated.staticData) body.staticData = updated.staticData

console.log(`→ Pushing updated workflow (${toAdd.length} new tools)…`)
const updateRes = await fetch(
  `${baseUrl}/api/v1/workflows/${N8N_WORKFLOW_ID}`,
  {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  },
)
if (!updateRes.ok) {
  const text = await updateRes.text().catch(() => '')
  fail(`n8n PUT failed (${updateRes.status}): ${text.slice(0, 400)}`)
}

console.log(`✓ Done. Added ${toAdd.length} tools to "${workflow.name}".`)
console.log(`  Open ${baseUrl}/workflow/${N8N_WORKFLOW_ID} to verify.`)
console.log(`  Tools added:`)
for (const t of toAdd) console.log(`    - ${t.name}`)
