# Kennion Website — Claude Code Instructions

## Core Principle

**Do everything yourself. Never ask the user to perform manual steps in GitHub,
Railway, or any other platform.** You own the full workflow: code changes,
configuration, migrations, deployment, fixing errors, and verifying the live
system. If something is blocked (e.g., network), find a workaround. Continue
working until the requested change is live on www.kennion.com and verified.

---

## Project Overview

- Full-stack web app deployed on Railway → **www.kennion.com**
- **Backend:** Express.js + TypeScript (ES modules, `"type": "module"`)
- **Frontend:** React (`client/`)
- **Database:** PostgreSQL via Drizzle ORM. Schema in `shared/schema.ts`.
- **Sessions:** PostgreSQL store via `connect-pg-simple`
- **Rate engine:** pure-TypeScript, runs in-process on the Node server
  (see "Rate Engine" section below — this is the core proposal-generation path).

---

## Database

- Drizzle ORM with PostgreSQL dialect
- Config: `drizzle.config.ts`
- Schema: `shared/schema.ts` (users, groups, census_entries, proposals)
- Migrations output: `./migrations`
- DB connection: `server/db.ts` using `DATABASE_URL`
- Seed creates default admin: `admin@kennion.com`

## Environment Variables

- `DATABASE_URL` (required) — PostgreSQL connection string
- `SESSION_SECRET` — Express session secret
- `RESEND_API_KEY` — Email service
- `OPENAI_API_KEY` — AI-powered CSV cleaning
- `ANTHROPIC_API_KEY` (or legacy `CLAUDE`, which is what the Railway
  service uses) — Claude AI underwriter review on the risk screen
  (advisory only; everything degrades gracefully when unset)
- `PORT` — defaults to 5000

Optional model overrides (comma-separated, best model first) — each
defaults to a sensible chain in `server/model-config.ts`; set these to bump
models on Railway without a code change:

- `CLAUDE_MODEL_CHAIN` — e.g. `claude-fable-5,claude-opus-4-8,claude-sonnet-4-6`
- `OPENAI_MODEL_CHAIN` — long-form prose, e.g. `gpt-4o`
- `OPENAI_MODEL_CHAIN_FAST` — cheap structured tasks, e.g. `gpt-4o-mini,gpt-4o`

## AI Underwriter Review (Claude) — advisory only

`server/ai-underwriter-review.ts` runs after every `screenGroup()` call
(both the customer upload path and the admin re-run path in
`server/routes.ts`) and asks Claude to write
the underwriter's file note for the group: ONE plain-English paragraph
(3-4 sentences, 60-90 words) explaining the screen's already-made
decision — no jargon, no verdict of its own. The approve/decline badge
shown next to the note is derived from the deterministic
`tier`/`decision`, never from the AI. The result is nested at
`result_json.claude_review` in `risk_screens` and rendered in the admin
Risk Screen dialog and on the screen PDF (in place of the deterministic
`ai_summary`, which stays stored for audit).

Hard rules:

- **The review NEVER gates.** It must not change `kri`, `tier`,
  `decision`, `groups.riskScore`, `groups.riskTier`, or the High-Risk
  proposal block. The deterministic KRS is the sole accept/decline gate.
  Do not "enhance" the review into the gating path.
- **Aggregate data only.** Only whitelisted `ScreenResult` aggregates go
  to the API (see `buildReviewInput`) — never census rows, names, DOBs,
  or per-member data.
- **Model selection + fallback.** The ordered chain lives in
  `server/model-config.ts` (`CLAUDE_MODEL_CHAIN`, default
  `claude-fable-5 → claude-opus-4-8 → claude-sonnet-4-6`). The shared
  `callClaudeWithFallback` helper in `server/anthropic-client.ts` walks the
  chain and advances to the next model on a safety-classifier **refusal**
  OR an **availability/transient error** (model unavailable/404, no
  access/403, overloaded/529, rate-limited/429, 5xx) — so the review always
  uses the best model that's actually working.
- **Failure is non-fatal.** No key / every model failing or refusing ⇒
  `claude_review` is simply absent and the screen persists as before.
- **Model upgrades** = edit `CLAUDE_MODEL_CHAIN` in
  `server/model-config.ts` (or set the `CLAUDE_MODEL_CHAIN` env var). Do not
  hard-code model IDs back into `server/ai-underwriter-review.ts`.

## Railway deployment

- Config: `railway.toml`
- Build: `npm install && npm run build`
- Deploy: `npm run db:push && npm run start`

---

# Sensitive data: SSN / tax-ID handling

Hard rule: **the only place an SSN ever lives in this system is the
acceptance email body sent to hunter@kennion.com via Resend.** Never:

- Add an SSN-bearing column to any DB table (`groups`, `census_entries`,
  `users`, `proposals`, or anything new).
- Echo SSN-bearing form fields back in any response. Acceptance routes
  return `{ ok: true }` only.
- Log a request body or its individual SSN fields. The response logger
  in `server/index.ts` captures `res.json()` payloads only — never let
  an SSN appear in a JSON response.
- Stash a raw CSV row in `req.session.*` without first running it
  through `stripSensitiveColumns(...)` in `server/routes.ts`. The
  helper drops any column whose header matches
  `SENSITIVE_HEADER_PATTERNS` (SSN, social-sec, tax-id, EIN, fed-id,
  credit card, CVV, driver license, passport, bank/routing).

The acceptance route validates `ssnLast4` + `ssnLast4Verify`, hands them
straight to `sendProposalAcceptanceEmail` in `server/email.ts`, and
the function exits — the value is garbage-collected. No DB write, no
log line, no session put. If you add new acceptance-style flows,
copy that pattern verbatim and keep the SSN out of any persistence.

CSV parse endpoints (`/api/groups/parse`, `/api/admin/quotes/parse`)
call `stripSensitiveColumns` on the parsed rows before anything else
touches them — the sanitised set is what reaches the AI cleaner, the
session table, the response, and the logs. Never bypass this on a
new parse path; if you add one, route it through the same helper.

---

# Rate Engine

This is how kennion.com turns an uploaded census into proposal rates. Read this
section carefully before touching anything in `server/rate-engine.ts`,
`server/factor-tables.json`, or the `/api/rate/*` routes.

## What it is

The rate engine is a **pure-TypeScript, deterministic port of the actuary's
composite RBP rating math** from `Kennion Actuarial Rater.xlsm` (the file the
actuary maintains, checked in at repo root). It runs in-process on the Node
server — no LibreOffice, no VBA, no Python subprocess, no network call.

Public API (`server/rate-engine.ts`):

```ts
import { priceGroup, censusEntriesToMembers } from "./rate-engine";

const rates = priceGroup({
  census: members,                 // CensusMember[]
  effectiveDate: "2026-06-01",
  ratingArea: "auto",              // or Birmingham/Huntsville/Montgomery/Alabama Other Area/Out-of-State
  admin: "EBPA",                   // or HEALTHEZ / Virtual_RBP / Virtual_RBP_HEALTHEZ
  group: "Faith Presbyterian Church",
});
// → { plan_rates: { "AL Healthy 500": { EE, EC, ES, EF }, ... }, area_factor, trend_adjustment, ... }
```

## Pricing formula

```
member_PMPM[plan]      = base_PMPM[plan] × AgeFactor[age] × AreaFactor[area]
group_EE_rate[plan]    = avg_over_employees(member_PMPM) × trend_adj
group_EC_rate[plan]    = group_EE_rate × 1.85       # ECH tier
group_ES_rate[plan]    = group_EE_rate × 2.00       # ESP tier
group_EF_rate[plan]    = group_EE_rate × 2.85       # FAM tier
trend_adj              = (1 + trend_rate) ^ (years from 2025-01-01 to effective_date)
```

Base PMPM = the actuary's "Claims + Expenses + Margin Normalized" column F of
the Plan Base Rates tab (6:1 curve).

## Data flow

```
 actuary's .xlsm  ──(one-time sync)──►  server/factor-tables.json
                                                │
 group uploads census  ─► census_entries ─► /api/rate/price-group/:groupId
                                                │
                                                ▼
                                       priceGroup()  →  plan_rates JSON
                                                │
                                                ▼
                                   proposal engine → PDF → user
```

The actuary's workbook is the **single source of truth** for factors. The
engine never touches the .xlsm at runtime — only the JSON that's baked from it.

## Files

| File | Purpose | Who edits it |
|---|---|---|
| `server/rate-engine.ts` | Pricing engine (TypeScript, zero deps beyond stdlib). Public API: `priceGroup`, `inferRatingArea`, `censusEntriesToMembers`, `loadFactorTables`. | Engineering |
| `server/factor-tables.json` | Frozen numeric tables: age factors (0-81), area factors (5), plan base PMPM (23 plans), trend rate, tier multipliers. **Do not hand-edit.** | Auto-generated from .xlsm |
| `scripts/sync-rater.py` | Regenerates `factor-tables.json` from `Kennion Actuarial Rater.xlsm` via openpyxl (read-only, `data_only=True`). | Run after actuary updates .xlsm |
| `Kennion Actuarial Rater.xlsm` | The actuary's workbook. Checked into the repo. Cached values from the last Excel save are what `sync-rater.py` reads. | The actuary |
| `server/routes.ts` → `/api/rate/*` | HTTP endpoints: `GET /api/rate/tables`, `POST /api/rate/reload`, `POST /api/rate/price`, `POST /api/rate/price-group/:groupId`. | Engineering |

## HTTP endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET`  | `/api/rate/tables` | none | Factor-tables metadata: version, sha256, synced_at, plan count, area factors, trend. Safe to expose in UI. |
| `POST` | `/api/rate/reload` | admin | Reload `factor-tables.json` from disk after a swap (hot reload, no restart). |
| `POST` | `/api/rate/price` | auth | Price an ad-hoc census passed as JSON. Used for quoting and tests. |
| `POST` | `/api/rate/price-group/:groupId` | auth | Price a stored group. Loads `groups` + `census_entries` by id and returns plan rates. This is the endpoint the proposal flow uses. |

## ★★★ Workflow: actuary updates the .xlsm ★★★

This is the whole point of the design. When the actuary ships a new
`Kennion Actuarial Rater.xlsm`, keeping the site accurate is a **3-step,
no-downtime** drop-in:

1. **Replace the workbook in the repo.**
   ```bash
   cp /path/to/new/Kennion\ Actuarial\ Rater.xlsm .
   ```
   (or have the user drop it into the repo root / upload via GitHub web UI —
   Claude Code should do this step via `git` commands, not ask the user.)

2. **Regenerate the JSON.**
   ```bash
   python3 scripts/sync-rater.py --xlsm "Kennion Actuarial Rater.xlsm" --out server/factor-tables.json
   ```
   This reads the cached numeric values from the workbook with openpyxl in
   read-only, data_only mode. It does **not** evaluate VBA or formulas — it
   trusts whatever Excel last saved. Safe to run against the live file; it
   never writes to it.

3. **Commit, push, deploy.**
   ```bash
   git add "Kennion Actuarial Rater.xlsm" server/factor-tables.json
   git commit -m "Sync factor tables from rater vX.Y"
   git push origin main
   ```
   Railway redeploys on push. The new engine picks up the new JSON on boot.
   (Or, if you don't want a redeploy, `POST /api/rate/reload` hot-reloads the
   tables on the running server.)

### What could break — and how to catch it

`sync-rater.py` is pinned to the actuary's current tab/column layout:

- Tab names: `Age Rating Factors`, `Area Rating Factors`, `Plan Base Rates`
- Age factors: col B = age, col C = factor, rows 5+
- Area factors: col A = area name, col B = factor, rows 4-8
- Plan Base Rates: col A = plan name, col F = total-margin PMPM (`plan_base_pmpm_6to1[plan].total_margin`), rows after the "New Business Plan" header
- Trend rate: row where col A = "Trend Rate", col B = rate
- Tier multipliers: hardcoded defaults `EE 1.0 / ECH 1.85 / ESP 2.00 / FAM 2.85`

If the actuary moves a column, renames a tab, or reshapes the plan grid,
`sync-rater.py` will emit a partial or empty JSON. Two guardrails:

- `sync-rater.py` logs a summary line to stderr:
  `[sync_rater] ages=82  areas=5/5  plans=23  trend=0.070`.
  Plans < ~15 or areas < 5 ⇒ layout changed, investigate before committing.

- After syncing, run the parity smoke test against the 4 known sample
  censuses to confirm the math still matches the prior release before you
  push:
  ```bash
  # Drop the 4 AdHocReport_2026_04_20*.csv files into /tmp/samples/ first.
  npx tsx server/rate-engine.smoke.ts    # exits non-zero on any mismatch
  ```

### When the shape of the rater changes

If the actuary adds a new plan column, new area, new tier, or changes the
formula family:

1. Update `sync-rater.py` to extract the new fields.
2. Update `FactorTables` type in `server/rate-engine.ts`.
3. Update `priceGroup()` to incorporate the new inputs.
4. Re-run the smoke test against all prior sample censuses and eyeball diffs.
5. Coordinate with the actuary on a version bump (`tables["version"]`).

The rating-area list and the 4 admin buckets (EBPA / HEALTHEZ / Virtual_RBP /
Virtual_RBP_HEALTHEZ) are stable across versions — don't remove them without
actuary sign-off.

## Rating-area inference

When `rating_area` is `"auto"` (or omitted), the engine infers from the
census:

- First employee with a state → `inferRatingArea(state, zip)`
- Else first employee with a zip → `inferRatingArea(null, zip)` (uses zip range)
- Else any member with state/zip → same

Rules:
- State ≠ AL → **Out-of-State** (factor 1.08)
- AL zip 350-352 → **Birmingham** (1.003)
- AL zip 358-359 → **Huntsville** (0.992)
- AL zip 360-361 → **Montgomery** (0.988)
- Other AL (353-357, 362-369) → **Alabama Other Area** (1.01)

## Legacy proposal engine

`server/proposal-engine.ts` is the old LibreOffice/VBA-based pipeline (writes
to the .xlsm, shells out to soffice to render PDF). It still works, but
**new proposal work should call `priceGroup()` directly** and render rates
server-side — don't round-trip through LibreOffice.

The admin endpoint `POST /api/admin/proposal/generate/:groupId` in
`server/routes.ts` is the integration seam. To switch it over:

1. Replace the `generateProposal(group, census, targetSheet)` call with
   `priceGroup({ census: censusEntriesToMembers(census), effectiveDate, ... })`.
2. Render the `plan_rates` object into a PDF using pdfkit (already a dep).
3. Keep the DB write to `proposals` table unchanged.

---

## Rate engine: common tasks

**"Actuary sent a new .xlsm."**
→ Drop it in the repo root, run `python3 scripts/sync-rater.py`, commit both
files, push. Verify with `GET /api/rate/tables` on the live site — the
`synced_at` timestamp should match the sync.

**"A group got priced wrong."**
→ `POST /api/rate/price-group/:groupId` with `{ effective_date }` and inspect
the JSON output. Compare `area_factor`, `group_age_factor_ee`, and per-plan
`EE` against the spreadsheet manually for one group. If those three match, the
rest is deterministic.

**"Add a new plan."**
→ The actuary adds it to the .xlsm's Plan Base Rates tab. Re-sync. The plan
appears automatically in `plan_rates` with no code change.

**"Add a new rating area (e.g., a different state)."**
→ (a) Actuary adds an area name + factor in the Area Rating Factors tab.
(b) Update `EXPECTED_AREAS` in `scripts/sync-rater.py` and the `RatingArea`
union in `server/rate-engine.ts`. (c) Update zip→area logic in
`inferRatingArea` if auto-inference should handle it. (d) Re-sync, test, ship.

**"Change tier multipliers."**
→ They're currently hardcoded defaults in `sync-rater.py` because the .xlsm
stores them inconsistently. Update `DEFAULT_TIERS` in `sync-rater.py` and
re-sync.

---

## Testing

Parity smoke test lives at `server/rate-engine.smoke.ts` (if present) and
exercises the 4 canonical sample censuses. Must pass before any rate-engine
PR merges.

```bash
npx tsx server/rate-engine.smoke.ts
# → "Total diffs: 0  (PARITY OK)"
```

The 4 sample AdHoc CSVs and their known-good priced outputs live in the
Kennion Model Data workspace (not in the repo — they contain PHI).
