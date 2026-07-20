# Handoff: Kennion Admin Dashboard Redesign

## Overview
A redesigned admin dashboard for Kennion Benefit Advisors — the internal tool brokers use to review census submissions, manage users, and generate proposals from an XLSM template. The redesign introduces a **left sidebar layout**, a **dedicated group detail page with tabs** (replacing the prior modal-based flow), **hash-based routing**, and **keyboard navigation**. It is a direct successor to the existing `client/src/pages/admin.tsx` implementation.

## About the Design Files
The files in this bundle are **design references created in HTML/JSX** — a working prototype showing the intended look and behavior. They are **not production code to copy directly**. Your task is to **recreate these designs in the existing Kennion codebase** (React + TypeScript + Wouter/React Router + shadcn/ui + Tailwind, based on the reference pulled from the repo) using its established patterns, components, and API wiring. The prototype uses inline `<script type="text/babel">` with `window.MOCK` data; the real app should use its existing TanStack Query hooks, tRPC/REST client, and route/auth infrastructure.

## Fidelity
**High-fidelity.** Exact colors, spacing, typography, interaction states, and tier color logic are all locked in. The CSS tokens are lifted directly from the existing `client/src/index.css`, so most primitives should map 1:1 to the shadcn/ui components already in the codebase (Button, Badge, Card, Select, Table, Dialog, Tabs, Input, Textarea). Where the prototype uses custom classes, prefer the codebase's shadcn/Tailwind equivalents.

## Overall Layout

A full-height two-column layout:

- **Sidebar** (240px, fixed, sticky to viewport):
  - Logo header (`K` mark in primary color + "Kennion / Benefit Advisors")
  - "Workspace" nav group: Dashboard, Groups, Users, Proposal Generator (each with icon + optional count pill)
  - "Settings" nav group: Templates, Settings
  - Footer: compact user chip (avatar + name + "Admin")
  - Active item has `primary-10` background, `primary` text, and a 3px left accent bar
- **Main column**:
  - Sticky topbar: breadcrumbs (left) · global search with `/` shortcut (center) · notification bell, theme toggle, tweaks trigger (right)
  - Content area: max-width 90rem, 24px padding

## Screens / Views

### 1. Dashboard
- "Welcome back, Jordan" header + "New Submission" primary button (top right)
- 4 stat cards in a grid: Active Submissions, Total Lives, Proposals Sent, Active Clients (Clients card uses green-700 text)
- "Recent Submissions" card with a simple 5-row table (Company, Contact, Lives, Status, Submitted). Rows click through to the group detail page.

### 2. Groups (list view)
- Header + "New Group" primary button
- **Stats overview row** (5 cards): one per status from `STATUS_OPTIONS` — Census Uploaded, Proposal Sent, Proposal Accepted, Client, Not Approved. Each card has an icon pill (primary-10 bg) and a large count.
- **Toolbar**: status filter select + result badge ("N of M") + "Export CSV" outline button
- **Groups table** — the centerpiece:
  - Rows are grouped by company. Company rows show aggregate info + chevron; click to expand into individual census submissions (indented, with census ID, submitted time, status).
  - Columns: Submitted · Company · Contact · Email · Phone · Status · View
  - Clicking a census row navigates to `#/groups/:id`.
  - Sticky table header (background `var(--muted-30)` with blur).

### 3. Group Detail (the big one)
Route: `#/groups/:id`

Header block:
- Large company name + status badge + tier badge (Preferred Risk / Standard Risk / High Risk — green/blue/red)
- Sub-line: census ID (mono) · contact name · contact email (mailto) · submitted-at
- Action buttons (top right): Export · Generate Proposal · Contact Client (primary)

Tabs (underline style, bottom-bordered, active is primary-colored):
1. **Overview** — 4 stat cards (Total Lives, Employees, Average Age, Risk Score). Risk Score uses **tier color**, not primary. Below: two-column section row — left card "Age Distribution" (5 bucket horizontal bar chart), right card "Composition" (Enrollment bar EE/SP/CH + Gender bar M/F, both multi-segment colored bars 28px tall).
2. **Census Data** — simple key/value table (Metric / Value / Notes rows for each demographic metric).
3. **Risk Analysis** — left card: Risk Score Breakdown (progress bar 0→1.5 with preferred/standard/high markers, then factor breakdown bar chart: Age factor, Gender mix, Family composition, Industry class, Geography). Right card: large number gauge (52px, tier color) + tier label + explanation sentence.
4. **Submissions** — full census history for this company (one row per submission, highlighted if current).
5. **Notes & Status** — two cards side by side: status select + Update Status button; admin notes textarea + Save Notes button. Previous notes show below in a muted note-card.
6. **Activity** — vertical timeline (dot + title + meta, connector line between dots).

### 4. Users
Search input, count badge. Table columns: Name · Email · Company · Phone · Role (Badge blue for admin, gray for client) · Verified (check icon green / x icon muted) · Joined · Actions (Edit, Trash).

### 5. Proposal Generator
Two cards:
- **XLSM Template card**: shows current uploaded file (icon + name + size + uploaded-at) with Replace / Remove actions. If no file: dashed dropzone with upload icon. Sheet selector dropdown below.
- **Generate Proposals card**: grid of groups — each row has company name + lives, submitted date, status badge, "View PDF" or "No PDF" indicator, and a "Generate" primary button (shows spinning loader during generation).

### 6. Templates / Settings (placeholders)
Empty-state cards with icon and "Coming soon" copy. Remove from sidebar until implemented, OR build them out.

## Interactions & Behavior

- **Routing**: Hash-based — `#/dashboard`, `#/groups`, `#/groups/:id`, `#/users`, `#/generator`. The prototype parses `window.location.hash` on load and listens to `hashchange`. **In the real app, use the existing router (Wouter) with real paths.**
- **Navigation**: Sidebar nav items set the view. Clicking a group row navigates to `#/groups/:id`. Back button + Esc both return to `#/groups`.
- **Breadcrumbs**: Clickable; "Admin → Groups → {Company Name}". Home crumb → Dashboard; Groups crumb → list.
- **Keyboard shortcuts**:
  - `/` focuses global search
  - `j` / `k` moves focus row in the groups table (adds/removes `.row-focused` class)
  - `Enter` opens focused row
  - `Esc` closes tweaks panel, or returns from detail to list
- **Status update**: Saves with a 600ms delay (simulated). Wire to the real API.
- **Proposal generation**: Button shows loader, resolves after 1.4s with the row marked "View PDF". Wire to real XLSM generation endpoint.
- **Tier → color mapping** (must be consistent everywhere):
  - `preferred` → green-700 (`hsl(145 70% 30%)`)
  - `standard` → blue-700 (`hsl(210 85% 30%)`)
  - `high` → red-700 (`hsl(0 72% 42%)`)

## State Management

Real app should use TanStack Query for:
- `useGroups()` — list of all census submissions
- `useGroup(id)` — single group with full detail
- `useUsers()`, `useTemplate()`
- `useUpdateGroupStatus()`, `useUpdateGroupNotes()`, `useGenerateProposal()` as mutations

Route state (current view, selected group ID) should come from the router, not local state.

## Design Tokens

Lifted from `client/src/index.css` — these are already in your codebase. Highlights:

**Colors (light mode)**:
- `--background` `hsl(210 20% 99%)`
- `--foreground` `hsl(215 25% 12%)`
- `--primary` `hsl(210 85% 35%)` (brand blue)
- `--card` `hsl(210 15% 97%)`, `--card-border` `hsl(210 12% 92%)`
- `--sidebar` `hsl(210 18% 95%)`, `--sidebar-border` `hsl(210 12% 90%)`
- `--muted` `hsl(210 12% 92%)`, `--muted-foreground` `hsl(210 10% 42%)`

**Semantic colors**:
- Blue-700 `hsl(210 85% 30%)`, Purple-700 `hsl(270 70% 40%)`, Green-700 `hsl(145 70% 30%)`, Red-700 `hsl(0 72% 42%)` — each with `-10` and `-20` alpha variants for backgrounds/borders

**Typography**:
- Sans: Inter (400/500/600/700)
- Mono: JetBrains Mono (for census IDs)
- Display/brand word: Georgia/serif is NOT used — Inter at weight 600 with -0.02em letter-spacing is the word-mark treatment
- Page H1: 24px / 700 / -0.02em
- Detail title: 24px / 700 / -0.02em
- Card stat value: 22px / 700
- Body: 14px / 400 / 1.5
- Small meta: 11–12px

**Spacing**: 4 / 6 / 8 / 12 / 16 / 20 / 24 / 32px scale
**Radius**: `--radius: 0.5rem` (most things), 6px for sidebar items, 9999px for badges
**Shadows**: `--shadow-sm: 0px 1px 2px -1px hsl(0 0% 0% / 0.05)`

## Components Checklist (map to shadcn/ui)

| Prototype | shadcn/ui equivalent |
|---|---|
| `Btn` | `Button` (variants: default, outline, ghost, secondary, destructive; sizes default / sm) |
| `Badge` | `Badge` (custom variants: blue/purple/green/red/gray/outline) |
| `StatusBadge` | `Badge` driven by `STATUS_OPTIONS` |
| `.card` | `Card` / `CardContent` |
| Group detail tabs | `Tabs` + `TabsList` + `TabsTrigger` + `TabsContent` (underline style) |
| Topbar search | `Input` + search icon |
| Status/sheet selects | `Select` |
| Admin notes | `Textarea` |
| Group detail page | Dedicated route component — **not** a Dialog |
| Sidebar | Build against your existing layout primitives or shadcn `Sidebar` |

## Assets
- No external assets required. All icons are inline SVG (the prototype has a custom `<Icon>` switch with ~30 Lucide-style glyphs — in the real codebase, use `lucide-react` directly; the icon names in the prototype correspond 1:1 to lucide names where available).
- Fonts: Inter + JetBrains Mono from Google Fonts (already set up in the target repo presumably).

## Files in this bundle

- `Kennion Proposal Generator.html` — the prototype entry point
- `styles.css` — all design tokens + component styles (reference only; your Tailwind setup should replace this)
- `data.js` — mock data structure. Useful as a type reference for the real API response shape (`groups[]`, `users[]`, `template`, `STATUS_OPTIONS`, `TIER_CONFIG`).
- `components/App.jsx` — main shell, router, keyboard nav, tweaks panel
- `components/Groups.jsx` — stats overview, grouped table, legacy detail dialog (can be removed in favor of GroupDetail page)
- `components/GroupDetail.jsx` — the six-tab detail page
- `components/UsersAndGenerator.jsx` — Users tab and Proposal Generator tab
- `components/ui.jsx` — shared primitives (Icon, Btn, Badge, StatusBadge, KennionLogo, date/file helpers)

## Implementation Order (suggested)

1. Scaffold the new sidebar layout as a shell around the existing admin page (behind a feature flag if desired).
2. Build the new `<GroupDetailPage>` route at `/admin/groups/:id` with the 6 tabs; wire to existing queries.
3. Port the grouped-by-company table from `components/Groups.jsx` into the existing Groups list.
4. Replace the existing detail Dialog with a navigation to the new page.
5. Add keyboard shortcuts (`j`/`k`/`Enter`/`/`/`Esc`) at the layout level.
6. Apply tier-color mapping everywhere `riskScore` is displayed.
7. Drop sidebar items for Templates/Settings or build them out.

## Out of scope for this handoff
- Real XLSM injection logic (the generator button is UI-only)
- Permissions beyond `role === "admin"` gating of the whole page
- Mobile responsive behavior below 900px needs a sidebar drawer — not designed here
