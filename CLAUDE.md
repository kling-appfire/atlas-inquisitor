# Atlassian Migration Advisor — CLAUDE.md

> **Read this file completely before writing any code.**
> This is a read-only analysis tool. It never writes to Jira or Confluence.

---

## What This Project Does

This is an **n8n workflow backend + Cloudflare Workers API** that inspects an Atlassian Data Center instance (Jira, Confluence, JSM) and produces structured, ordered pre-migration analysis reports to prepare the instance for migration to Atlassian Cloud.

It ingests data from the Atlassian DC REST APIs, applies configurable rules, and outputs a progressive series of HTML/JSON report artifacts — each building on the previous — culminating in a full migration readiness assessment.

---

## Architecture Overview

```
Atlassian DC Instance (read-only)
        │
        ▼
[ Cloudflare Worker: API Gateway ]   ← entry point, auth, rate limiting
        │
        ▼
[ n8n Workflow Orchestrator ]        ← triggers report stages in order
        │
        ├──► [ Workers: Collectors ]  ← one per domain (users, projects, config, apps…)
        │         │
        │         ▼
        │    [ Atlassian DC REST Adapter Layer ]
        │
        ├──► [ Rules Engine ]         ← applies config/rules/*.json
        │
        └──► [ Report Generators ]    ← produces HTML + JSON artifacts per section
```

### Key Architectural Constraints

- **All Atlassian API calls are READ-ONLY.** No POST/PUT/DELETE to Jira/Confluence ever.
- Workers are stateless. All state flows through n8n or is written to R2/KV.
- Each report section is an independent Worker that can be triggered and re-run.
- The rules engine is purely deterministic — no LLM in the hot path.
- Report generation (summarization, recommendations) may call Claude API.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Cloudflare Workers (ES modules format) |
| Orchestration | n8n (self-hosted or cloud) |
| Storage | Cloudflare R2 (report artifacts), KV (job state) |
| Language | TypeScript (strict mode, no `any`) |
| Testing | Vitest + Miniflare |
| Linting | ESLint + Prettier |
| Config | `config/rules.json` (editable, versioned) |
| Secrets | Cloudflare secrets / `.dev.vars` locally |

---

## Directory Structure

```
/
├── CLAUDE.md                        ← you are here
├── .claude/
│   ├── RULES.md                     ← behavioral rules for Claude Code
│   └── settings.json                ← Claude Code MCP/tool settings
├── config/
│   ├── rules.json                   ← THE migration rules config (thresholds, exclusions)
│   └── rules.schema.json            ← JSON schema for rules.json validation
├── src/
│   ├── api/                         ← Cloudflare Worker entry points (one per route)
│   │   ├── index.ts                 ← main router Worker
│   │   └── webhooks.ts              ← n8n callback receiver
│   ├── workers/                     ← domain collector Workers
│   │   ├── users.worker.ts
│   │   ├── projects.worker.ts
│   │   ├── confluence.worker.ts
│   │   ├── config.worker.ts         ← schemes, workflows, custom fields
│   │   ├── apps.worker.ts
│   │   └── automations.worker.ts
│   ├── adapters/
│   │   ├── jira-dc.adapter.ts       ← all Jira DC REST calls live here
│   │   └── confluence-dc.adapter.ts ← all Confluence DC REST calls live here
│   ├── rules/
│   │   └── engine.ts                ← loads rules.json, exports classify() functions
│   ├── reports/                     ← one file per report section (matches spec §1–§11)
│   │   ├── 01-scope.report.ts
│   │   ├── 02-users.report.ts
│   │   ├── 03-portfolio.report.ts
│   │   ├── 04-data-reduction.report.ts
│   │   ├── 05-config-inventory.report.ts
│   │   ├── 06-config-cleanup.report.ts
│   │   ├── 07-data-quality.report.ts
│   │   ├── 08-apps.report.ts
│   │   ├── 10-automations.report.ts
│   │   └── 11-environment.report.ts
│   ├── services/
│   │   ├── pagination.ts            ← handles Jira/Confluence paginated APIs
│   │   ├── cache.ts                 ← KV-backed result caching
│   │   └── claude-api.ts            ← Claude API calls for summarization
│   └── utils/
│       ├── logger.ts
│       └── validators.ts
├── tests/
│   ├── fixtures/                    ← mock Jira/Confluence API responses
│   └── rules.engine.test.ts
├── docs/
│   └── report-sections.md
├── n8n/
│   └── workflows/
│       └── migration-advisor.json   ← exportable n8n workflow definition
├── wrangler.toml                    ← Cloudflare Workers config
├── package.json
└── tsconfig.json
```

---

## Environment Variables / Secrets

Set via `wrangler secret put` in production, or `.dev.vars` locally:

```
JIRA_DC_BASE_URL=https://your-jira.company.com
JIRA_DC_USERNAME=migration-readonly
JIRA_DC_API_TOKEN=...
CONFLUENCE_DC_BASE_URL=https://your-confluence.company.com
CONFLUENCE_DC_USERNAME=migration-readonly
CONFLUENCE_DC_API_TOKEN=...
ANTHROPIC_API_KEY=...           # for report summarization
N8N_WEBHOOK_SECRET=...          # validates n8n callbacks
```

**Never hardcode secrets. Never log them. Never include them in report output.**

---

## Development Commands

```bash
npm install               # install deps
npm run dev               # local Workers dev server (wrangler dev)
npm run test              # vitest
npm run lint              # eslint + prettier check
npm run type-check        # tsc --noEmit
npm run deploy            # wrangler deploy
npm run validate-config   # validate config/rules.json against schema
```

---

## Report Pipeline — Execution Order

Reports **must** run in this order. Each stage may depend on outputs of prior stages:

```
1  → scope         (defines what's in/out-of-scope from config)
2  → users         (produces deactivation/cleanup candidate lists)
3  → portfolio     (classifies projects/spaces: active/dormant/archive/delete)
4  → data-reduction (uses §3 delete list; identifies bulk trash)
5  → config-inventory (full scheme/field/workflow inventory)
6  → config-cleanup (uses §3 delete list as virtual deletions)
7  → data-quality  (integrity checks)
8  → apps          (marketplace + custom app inventory)
10 → automations   (custom scripts, ScriptRunner, n8n flows)
11 → environment   (DC version checks, Cloud limits)
```

When computing §6 config-cleanup, treat all projects flagged for deletion in §3 as already deleted when calculating "referenced projects" counts.

---

## Atlassian DC REST API Patterns

- Jira base: `{JIRA_DC_BASE_URL}/rest/api/2/`
- Confluence base: `{CONFLUENCE_DC_BASE_URL}/rest/api/`
- All calls use Basic Auth (username:token)
- Pagination: Jira uses `startAt`/`maxResults`/`total`; Confluence uses `start`/`limit`/`_links.next`
- Always use the `pagination.ts` service — never inline pagination logic
- Default page size: 50 (Jira), 25 (Confluence) — respect API limits

---

## Rules Engine — How It Works

`config/rules.json` is the single source of truth for all thresholds and exclusions.

The rules engine (`src/rules/engine.ts`) exports typed classifier functions:

```typescript
classifyProject(project, lastActivity, rules): 'active' | 'dormant' | 'archive' | 'delete'
classifyUser(user, rules): 'active' | 'deactivate' | 'remove'
isInScope(key: string, type: 'project' | 'space', rules): boolean
```

**Never hardcode thresholds** (day counts, size limits, etc.) in report files. Always read from the rules engine.

---

## Claude API Usage (src/services/claude-api.ts)

Used **only** for:
1. Generating human-readable recommendation summaries in reports
2. Identifying duplicate/variant workflow patterns
3. Drafting migration wave rationale

**Not used for:** data collection, classification decisions, API calls to Jira/Confluence, or any deterministic logic (use rules engine for that).

Model: `claude-sonnet-4-20250514`. Max tokens: 1000 per call. Always stream for UX.

---

## Report Output Format

Each report section produces two artifacts stored in R2:

- `reports/{jobId}/section-{N}.json` — structured data (for downstream processing)
- `reports/{jobId}/section-{N}.html` — human-readable report with recommendations

HTML reports use a shared template (`src/reports/_template.ts`) and must be self-contained (inline CSS, no external dependencies).

---

## Key Constraints & Gotchas

1. **Read-only always.** If you find yourself calling a non-GET Atlassian endpoint, stop.
2. **Cascade logic in §6.** Config cleanup counts must subtract §3 deletion candidates — use `engine.getVirtuallyDeletedProjects(jobId)` to get that list.
3. **JSM is Jira.** Jira Service Management projects are Jira projects with `projectTypeKey: "service_desk"` — handle them in the projects collector with JSM-specific checks.
4. **Confluence spaces vs Jira projects** have different APIs but share the portfolio classification logic.
5. **Large instances.** Assume 10k+ issues, 1k+ projects. Always paginate. Never fetch all-at-once.
6. **n8n workflow JSON** in `n8n/workflows/` must stay in sync with the Worker endpoints.
