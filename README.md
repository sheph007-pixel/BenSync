# Kennion 2027 Renewal Portal

A group-facing renewal portal for Kennion Benefit Advisors. A group signs in
with its access code and sees two things:

1. **Current Medical Plan(s)** — the plans in force for the 2026 plan year,
   with 4-tier composite rates, enrollment by tier, and total monthly employer
   cost / employee cost / premium per plan. An **Employee Cost Breakdown** opens
   named employee detail with ages, tier and per-person EE/ER/total, switchable
   between monthly, semi-monthly, bi-weekly and weekly.
2. **2027 Medical Plan Options** — the shopped market (UnitedHealthcare Level
   Funded, Surest by UHC, Gravie), every plan costed at the group's own census,
   with three Kennion recommendations above a sortable 95-plan grid. Groups
   build a shortlist and send it with a note to their rep.

Both sections print to a clean report, and every page carries the carrier
disclaimer footer — including in print.

Kennion staff reach **Rate Administration** through the small "Admin" link under
the sign-in card, with an email and code.

## Access codes and group size

A group's code is four letters from its company name plus the plan year —
`JSMH2027` for Johnson Storage & Moving Co. Holdings. Four or more significant
words give their initials; shorter names use the first four letters run
together (`DAHL2027`), and legal-form words like "LLC", "Inc." and "Holdings"
never take a slot. Clashes replace the last letter with a digit, so every code
stays eight characters — Certicable is `CERT2027`, Certified Alarm `CER22027`.

Codes are derived over the whole roster so they are collision-free, and any of
them can be typed over in the Groups table; a hand-assigned code wins and is
checked for uniqueness. Codes from the previous `KEN-XXXX-9999` scheme are still
accepted, so anything already sent out keeps working.

Each group is also categorised **2-50** or **51+ (ALE)**. It defaults from
enrolled headcount and can be set explicitly, since ALE status is a legal
determination rather than something an enrollment count settles.

## Privacy

The census carries names, ages, genders, ZIPs and premiums for over 1,300
people, so it is **never served as a static file**. It is read privately by the
server and handed out one group at a time via `POST /api/signin`, in exchange
for that group's code. A wrong code gets a 404 and no data. Rate Administration
receives a projection with group names, plans and rates but **no member
records**. Access codes are resolved server-side and never reach the browser, so
they cannot be enumerated from the bundle.

## Where the numbers come from

`server/data/kennion.json` is the shipped baseline, built from the Employee
Navigator Data API export of 7/31/2026 and the UnitedHealthcare full-menu quotes
of 8/28–8/31/2026: 68 groups and 1,318 employee records. Imported groups are
layered over it.

Three rules govern every rate, and the UI labels which applies:

| Source | Shown as | Meaning |
| --- | --- | --- |
| **Billed** | plain | Employee Navigator has a premium for this tier, because someone is enrolled in it. |
| **Calculated** | `calc.` | Nobody is enrolled in this tier, so nothing is billed for it anywhere. Derived at the program tier factors — EE 1.00 / EE+SP 2.00 / EE+CH 1.85 / EE+Family 2.85. Never contributes to a total. |
| **Manual** | blue, in Rate Admin | Keyed by hand from a carrier rate sheet. Beats both of the above. |

Of the 165 billed non-employee tier rates in the export, 161 reconcile within
the 0.5% tolerance the app uses, and 155 are exact to the cent. The four that
miss belong to three plans — Forestry's EBPA Preferred Silver and EBPA Deluxe
Platinum, and Electrical Repair's EBPA Platinum 150. Those are flagged **Off
schedule** in Rate Admin, and their calculated tiers are described to clients as
approximate pending the TPA rate sheet rather than as confident numbers.

Employer/employee split is **actual** — read from the Employee Navigator payroll
configuration — for groups whose export has been loaded, and is not adjustable
there. Groups without one show a "Pending" notice and placeholder percentages,
clearly labelled; their total premium is billed data and is correct.

## Importing an Employee Navigator export

Upload an EN XML in Rate Administration — a single group, or a full Data API
export with every company in it. The document root is `<Company>`, so a full
export is a run of them; they are streamed and parsed one at a time, so a
100 MB+ file never lands in memory whole (a 107 MB export parses in about six
seconds under a 400 MB heap).

The parser takes **active medical enrollments only** — `Benefit=Medical`,
`EmploymentStatus=Active`, and no `EndDate` — and reads `CoverageLevel` as the
tier, `PlanCost` as the billed rate, and `EmployeeCost`/`EmployerCost` as the
actual split. Dependent ages come from the nested `<Dependent>` records; the
carrier and the company address come from the `<Plans>` catalog and `<Company>`
record. Plan names have their trailing year stripped so they match the census.

Nothing is saved until you confirm. The preview lists every company found with
its EN identifier, enrolled count, monthly premium and whether actual splits
were found, each against what that group currently has — so a newer export that
legitimately moves the numbers does so visibly. Tick the ones to import.
Importing replaces those groups outright; access codes are unchanged. Company
records with no active medical enrollment are named and skipped rather than
failing the batch.

## Storage

Set `DATABASE_URL` and Postgres becomes the source of truth for everything a
human enters:

| Table | Holds |
| --- | --- |
| `kennion.groups` | one row per imported group — EN identifier, access code, full payload and contribution split, with `imported_at` / `imported_by` |
| `kennion.group_meta` | staff-assigned access code and ALE bucket per group |
| `kennion.rate_overrides` | hand-keyed rates by group + plan + tier, with `updated_at` / `updated_by` |

Everything lives in a dedicated `kennion` schema. The database may already carry
tables from a previous application — a `public.groups` from the old platform is
exactly such a case, and an unqualified `CREATE TABLE IF NOT EXISTS groups`
silently does nothing against it, then inserts fail on the wrong columns. The
schema keeps this app's tables from colliding and leaves anything in `public`
alone. It is created on start; there is no migration step.

Rate edits are written to the database as they are typed, so they are shared
across the team rather than living in whoever's browser typed them.

Without `DATABASE_URL` the portal still runs: imports fall back to
`$DATA_DIR/imported-groups.json`, and since Railway replaces the container
filesystem on every deploy, `DATA_DIR` needs to point at a mounted volume for
those to survive. The admin screen states which of the three modes is in effect.
A database that is configured but unreachable is logged and the site serves the
shipped census rather than failing to boot.

## Known gaps

- The EBPA and HealthEZ 2026 rate sheets would replace every `calc.` label with
  a published number.
- Gravie shows "quote requested" rather than invented rates. Surest is priced
  only where UnitedHealthcare included it.
- Staff sessions are held in memory, so a restart signs staff out and a
  multi-instance deployment would need a shared session store.

## Run

```bash
npm install
npm run dev      # Vite dev server
npm run build    # type-check + production build to dist/public
npm run start    # serve the build on $PORT (default 5000)
```

## Deploy

Railway, nixpacks — see `railway.toml` / `railway.json`. `npm run build`
produces `dist/public`; `npm run start` serves it through a small Express
process with a `/healthz` check.

The build command is `npm install`, not `npm ci`: Railway mounts a build cache
at `/app/node_modules/.cache`, and `npm ci` removes `node_modules` wholesale, so
it fails trying to `rmdir` that mount point with `EBUSY`.

Environment variables, all optional: `DATABASE_URL` (Postgres), `ADMIN_EMAIL`
and `ADMIN_CODE` for staff sign-in, `DATA_DIR` for a writable volume when there
is no database, and `PORT` (defaults to 5000). Set the admin values in Railway
so the real credentials are not the ones committed here.
