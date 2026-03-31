# Claude Code Behavioral Rules
# .claude/RULES.md
#
# These rules govern HOW Claude Code behaves in this project.
# CLAUDE.md tells Claude what the project is.
# This file tells Claude how to act when working in it.

---

## 🔴 ABSOLUTE RULES — Never Violate

### R-001: This Tool Is Read-Only
**Never** generate, suggest, or allow any code that performs a POST, PUT, PATCH, or DELETE
to a Jira or Confluence endpoint. Every Atlassian API call must be GET.

If a task seems to require a write operation, stop and ask the user.
Valid read-only alternatives exist for every analysis task.

### R-002: No `any` in TypeScript
Never use `any` as a type. Use `unknown` and narrow it, or define a proper interface.
`@ts-ignore` and `@ts-expect-error` require a comment explaining why.

### R-003: No Hardcoded Thresholds
Never hardcode numeric thresholds (day counts, size limits, item counts) directly in
report or worker files. All thresholds come from `config/rules.json` via the rules engine.

Correct:
```typescript
const status = engine.classifyProject(project, lastActivity, rules);
```

Wrong:
```typescript
if (daysSinceUpdate > 180) { ... }  // ❌ hardcoded
```

### R-004: Secrets Never in Code
Never put credentials, tokens, base URLs, or any environment-specific values in source files.
Always reference via `env.VARIABLE_NAME` (Cloudflare Workers pattern).

### R-005: Pagination Is Mandatory
Never fetch a list endpoint without pagination. Always use `src/services/pagination.ts`.
Assume any list could have thousands of items.

---

## 🟡 CONVENTIONS — Always Follow

### C-001: Worker File Pattern
Every Cloudflare Worker must use the ES module `export default { fetch }` format:

```typescript
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // ...
  }
} satisfies ExportedHandler<Env>;
```

Never use the legacy `addEventListener('fetch', ...)` pattern.

### C-002: All Atlassian Calls Go Through Adapters
Never call `fetch()` directly with an Atlassian URL in a worker, service, or report file.
All Atlassian REST calls must go through:
- `src/adapters/jira-dc.adapter.ts`
- `src/adapters/confluence-dc.adapter.ts`

This ensures consistent auth, error handling, rate limiting, and logging.

### C-003: Report Files Are Pure Transformers
Report files in `src/reports/` must only:
1. Accept pre-fetched data as input
2. Apply rules engine classifications
3. Return structured `ReportSection` objects

They must NOT call adapters directly, call Claude API directly, or write to storage.
Orchestration (fetching, storing, summarizing) happens in the Worker layer.

### C-004: Error Handling Pattern
All adapter calls must use the Result pattern — never throw across async boundaries:

```typescript
type Result<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };
```

Return errors as `Result`, log them, and include them in the report as warnings — don't
crash the entire report run because one API call failed.

### C-005: Report Section Numbering
Report files and their JSON/HTML outputs must use the section numbers from the spec:
`01`, `02`, `03`, `04`, `05`, `06`, `07`, `08`, `10`, `11`
(Note: §09 is intentionally omitted to match the spec numbering.)

### C-006: Virtual Deletion in §6
When generating any §6 config-cleanup report, always call:
```typescript
const deletedProjects = engine.getVirtuallyDeletedProjects(jobContext);
```
and pass `deletedProjects` to all "referenced project count" calculations.
This must happen before ANY scheme usage counting in §6.

### C-007: JSM Detection
A project is a JSM/Service Management project when `projectTypeKey === 'service_desk'`.
Apply JSM-specific checks (request types, queues, SLAs, email channels) only to these.
Do not apply them to software or business projects.

### C-008: Confluence Spaces vs Jira Projects
Both are "containers" and share the `ClassifiedContainer` interface.
Portfolio classification logic is shared; API calls are not.
Never conflate the two in a single adapter call.

---

## 🟢 STYLE PREFERENCES

### S-001: Named Exports Over Default
Prefer named exports in all non-Worker files:
```typescript
export function classifyProject(...) { ... }  // ✓
export default function classifyProject(...) { ... }  // ✗ (except Workers)
```

### S-002: Interface Over Type for Object Shapes
Use `interface` for object shapes that represent domain entities.
Use `type` for unions, intersections, and utility types.

### S-003: Async/Await Over .then()
Always use async/await. Never chain `.then()` except in cases where Promise.all is needed.

### S-004: Descriptive Variable Names in Rules Engine
Rules engine classifier functions should use verbose, self-documenting names:
```typescript
const daysSinceLastIssueUpdate = differenceInDays(now, lastActivity);
const exceedsInactivityThreshold = daysSinceLastIssueUpdate > rules.projects.inactiveDaysThreshold;
```

### S-005: Zod for Runtime Validation
Use Zod to validate all incoming data from:
- Atlassian API responses (at adapter layer)
- n8n webhook payloads (at api/webhooks.ts)
- rules.json (at startup)

Do not use hand-written validation functions for these.

---

## 🔵 BEFORE GENERATING ANY NEW FILE — Checklist

Ask yourself before writing code:

- [ ] Does this touch an Atlassian endpoint? → Is it GET only? (R-001)
- [ ] Are there any numeric thresholds? → Do they come from rules engine? (R-003)
- [ ] Is this a list fetch? → Does it use pagination service? (R-005)
- [ ] Is this a Worker entry point? → Does it use `export default { fetch }` pattern? (C-001)
- [ ] Is this calling Atlassian APIs? → Is it going through the adapter layer? (C-002)
- [ ] Is this a report file? → Is it a pure transformer with no side effects? (C-003)
- [ ] Is this §6 config cleanup? → Is virtual deletion applied before counts? (C-006)
- [ ] Are there `any` types? → Replace with proper types (R-002)
- [ ] Are there hardcoded secrets or URLs? → Move to env vars (R-004)

---

## 🔵 BEFORE MODIFYING config/rules.json — Checklist

- [ ] Does the new field have a corresponding entry in `config/rules.schema.json`?
- [ ] Is the new field referenced in `src/rules/engine.ts` with proper typing?
- [ ] Does `npm run validate-config` pass?
- [ ] Is the field documented with a comment in the JSON (use `_comment` convention)?

---

## Claude API Usage Rules (src/services/claude-api.ts)

- Use model `claude-sonnet-4-20250514` only
- Always set `max_tokens: 1000`
- Only call Claude API from the Worker layer — never from report transformer files
- Summarization prompts must include the structured JSON data as context
- Never ask Claude to make classification decisions — those are deterministic (rules engine)
- Always handle Claude API failures gracefully — reports must render even without AI summaries

---

## n8n Workflow Rules

- The n8n workflow JSON in `n8n/workflows/migration-advisor.json` must reflect the actual
  Worker endpoints. When adding a new Worker route, update the n8n workflow.
- n8n webhook payloads are validated via Zod at `src/api/webhooks.ts`
- Webhook secret validation (HMAC or token check) is mandatory — never skip it

---

## Testing Rules

- Every rules engine classifier function must have unit tests in `tests/`
- Use fixtures in `tests/fixtures/` — never call real Atlassian APIs in tests
- Tests must cover the boundary conditions for each rules.json threshold
  (e.g., exactly at the inactive threshold, one day under, one day over)
- Report transformers must have snapshot tests for their output shape
