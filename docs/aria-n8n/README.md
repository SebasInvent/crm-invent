# Wiring Aria's CRM tools in n8n — 2 minutes

This folder contains the 6 tool nodes Aria needs to read & write the
CRM. Three ways to install them, ordered by speed.

## Path A — Copy-paste (fastest, 2 minutes)

1. **Set the env var on n8n.** Settings → Variables (or your `.env`
   if self-hosted): `ARIA_ACTION_TOKEN = <same value as in Vercel>`.
   Generate one with `openssl rand -hex 32` if you haven't yet.
   Paste the SAME value in Vercel → Project → Env Vars (Production).

2. **Open the Aria workflow.** `lab.inventagency.co/workflow/OWhhT1r17wh14if7`

3. **Open the JSON file** [`aria-tools-nodes.json`](./aria-tools-nodes.json)
   in any text editor and copy the entire content (Ctrl+A → Ctrl+C).

4. **Paste it on the canvas.** In n8n, click on empty canvas space
   then **Ctrl+V** (or right-click → Paste). Six new nodes appear:
   - Search CRM
   - CRM Stats
   - Create Contact
   - Create Lead
   - Update Lead
   - Move Deal

5. **Connect each tool to your AI Agent.** Drag from each tool node's
   small dot at the bottom (`Tool` output) to the AI Agent node's
   `Tool` input slot. 6 lines, one per node.

6. **Save the workflow.** Activate it if you toggled it off.

7. **Test in the CRM.** Open `crm-invent.vercel.app/dashboard`,
   press **⌘ J** to open Aria, ask: *"cómo va el pipeline?"* — should
   call `CRM Stats` and return the snapshot.

## Path B — n8n REST API (zero clicks, but needs your API key)

If you'd rather I run this via the n8n REST API instead of you doing
the paste, drop me your n8n API key (Settings → API → Create API
Key) and I'll PATCH the workflow directly. The script:

```bash
# Run from repo root once you have the key
N8N_API_KEY="..." \
N8N_BASE_URL="https://lab.inventagency.co" \
N8N_WORKFLOW_ID="OWhhT1r17wh14if7" \
node scripts/aria-n8n-install.mjs
```

(Script lives at `scripts/aria-n8n-install.mjs` — see below.)

## Path C — Import as a separate workflow (safest, leaves Aria untouched)

If you want to test the new tools without risking your live Aria
workflow:

1. n8n → **Workflows** → **Add workflow** → **Import from File**.
2. Select `aria-tools-nodes.json`.
3. The 6 nodes appear in a new workflow with no agent. Wire them up
   to a fresh AI Agent + chat trigger to test in isolation.
4. Once you're happy, copy the nodes into your real Aria workflow.

## Verifying it works

The 6 tools require both env vars to be aligned:

| Where | Variable | Value |
|---|---|---|
| Vercel (Production) | `ARIA_ACTION_TOKEN` | same long random string |
| n8n (Variables or `.env`) | `ARIA_ACTION_TOKEN` | same value |

Mismatched → every action returns 401 Invalid Aria token.
Vercel missing → 503 "Aria actions are not configured".

After installing, expected behavior:

- *"busca leads con score mayor a 70"* → calls `Search CRM`
- *"cuántos follow-ups tengo esta semana?"* → calls `CRM Stats`
- *"crea un lead llamado Pedro Test, score 60"* → calls `Create Lead`,
  you'll see a new row in `/dashboard/leads` plus an `activity_logs`
  entry "Lead creado por Aria"

## Troubleshooting

- **"Invalid Aria token"** → token mismatch between n8n and Vercel.
  Re-paste both sides with the same value.
- **n8n 404 on `@n8n/n8n-nodes-langchain.toolHttpRequest`** → your
  n8n version is too old. Upgrade to ≥ 1.50.
- **Tool runs but returns nothing** → Vercel function logs
  (Inspector → Functions tab) will show the rejection reason; the
  most common is hitting the rate limit during testing.
- **`$fromAI` placeholder errors** → the LLM is on a model that
  doesn't support OpenAI tools; use a tool-capable model (GPT-4o,
  Claude 3.5/3.7, Gemini 1.5+).
