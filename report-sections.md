# Report Sections Documentation

## Overview

The Migration Advisor produces **11 ordered report sections** (§1–§11, with §9 intentionally omitted to match the migration assessment specification). Each section builds on the results of prior sections.

---

## Execution Order & Dependencies

| # | Section | Worker File | Depends On |
|---|---------|-------------|------------|
| 1 | Scope | `01-scope.report.ts` | `config/rules.json` |
| 2 | Users & Identity | `02-users.report.ts` | §1 |
| 3 | Portfolio | `03-portfolio.report.ts` | §1, §2 |
| 4 | Data Reduction | `04-data-reduction.report.ts` | §3 |
| 5 | Config Inventory | `05-config-inventory.report.ts` | §3 |
| 6 | Config Cleanup | `06-config-cleanup.report.ts` | §3, §5 (**virtual deletion**) |
| 7 | Data Quality | `07-data-quality.report.ts` | §5, §6 |
| 8 | Apps | `08-apps.report.ts` | §1 |
| 10 | Automations | `10-automations.report.ts` | §8 |
| 11 | Environment | `11-environment.report.ts` | §1 |

---

## §1 — Scope

**Purpose:** Define the migration perimeter based on `config/rules.json`.

**Key Outputs:**
- List of in-scope Jira projects (post-exclusion filter)
- List of in-scope Confluence spaces (post-exclusion filter)
- Products identified (Jira Software, JSM, Confluence)
- Summary counts

---

## §2 — Users & Identity Cleanup

**Purpose:** Produce actionable user cleanup recommendations before migration.

**Key Outputs:**
- Identity source inventory (internal, LDAP, SSO)
- Deactivation candidates (by login inactivity threshold)
- Removal candidates (by extended inactivity + no login record)
- Invalid/duplicate email report
- Group normalization recommendations
- Group → Cloud role mapping recommendations

---

## §3 — Project/Space Portfolio

**Purpose:** Classify every container for migration planning.

**Key Outputs:**
- Per-project/space classification: `active | dormant | archive | delete`
- Migration wave assignment: `wave-1 | wave-2 | wave-3 | no-migrate`
- Legal/regulatory retention flags (manual input required)
- Cross-dependency map (shared boards, filters, plans)

> **§3 delete candidates become the virtual deletion set for §6.**

---

## §4 — Data Reduction

**Purpose:** Identify bulk data that can be purged pre-migration to reduce volume.

**Key Outputs:**
- Projects/spaces recommended for deletion/archive (from §3)
- Large attachment candidates (by rules thresholds)
- Suspected export ZIPs and log files
- JSM: deprecated queues, old tickets, email channels (for JSM projects only)

---

## §5 — Core Configuration Inventory

**Purpose:** Full inventory of all global Jira/Confluence configuration objects.

**Key Outputs (per object type):**
- Count of each: workflows, schemes, custom fields, screens, issue types, statuses
- Referenced-project counts
- Active/unused/sparse-use classifications
- Custom field usage: issue count, last updated, screens, project scope

---

## §6 — Configuration Cleanup (Ordered Steps)

**Critical Note:** All counts in this section apply **virtual deletion** from §3.
Projects flagged for deletion are treated as non-existent when counting references.

### Step 6.1 — Projects/Spaces
Archive/delete recommendations (already in §3; surfaced here as confirmation gate).

### Step 6.2 — Unreferenced Schemes
Permission, notification, issue type, workflow, field configuration, screen schemes with **zero** effective project references (post virtual deletion).

### Step 6.3 — Custom Fields
Fields flagged as low-use, on no screens, or with orphaned contexts.

### Step 6.4 — Workflows & Statuses
Duplicate workflow detection, Data Center–only post-functions, Groovy conditions.

### Step 6.5 — Permission & Notification Schemes
Consolidation recommendations to a small set of reusable patterns.

### Step 6.6 — Boards, Filters, Dashboards
Orphaned items from deactivated users; unused items by last-viewed date.

---

## §7 — Data Quality & Integrity

**Purpose:** Find data issues that will cause migration failures.

**Key Outputs:**
- References to deleted entities (orphaned field values, missing statuses)
- Cloud name/key length violations (from `dataQuality.cloudLimits` in rules)
- Data corruption flags

---

## §8 — App Inventory

**Purpose:** Complete marketplace and custom app inventory.

**Key Outputs:**
- All installed apps with version, vendor, license status
- Functional categorization (reporting, workflow, UI, data-storing)
- Data-storing vs UI-only classification
- "Migration Path" column (left empty — for future use)

---

## §10 — Custom Scripts & Automations

**Purpose:** Inventory all custom code and automation rules.

**Key Outputs:**
- ScriptRunner scripts: purpose, trigger, owner
- Automation rules: name, trigger, actions, usage frequency
- Capability → Cloud pattern mapping (Forge, Connect, Automation for Jira)
- Effort estimate for DC-only patterns
- Rebuild priority ranking

---

## §11 — Environment & Performance

**Purpose:** Verify migration tooling readiness.

**Key Outputs:**
- Jira/Confluence DC version (vs supported migration tool versions)
- Upgrade recommendations if version is below supported minimum
- Post-cleanup footprint vs Cloud limits (storage, automation limits, Assets entities)
