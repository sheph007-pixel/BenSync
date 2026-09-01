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

Both sections print to a clean report.

There is also a **Rate Administration** view (access code `KEN-ADMIN`, or the
link in the top nav) listing every group × plan × tier rate Kennion holds, with
the gaps highlighted for hand-keying.

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

## Where the numbers come from

Data ships as a single static file, `client/public/data/kennion.json`, built
from the Employee Navigator Data API export of 7/31/2026 and the UnitedHealthcare
full-menu quotes of 8/28–8/31/2026. It covers 69 groups and 1,318 employee
records.

Three rules govern every rate on the page, and the UI labels which applies:

| Source | Shown as | Meaning |
| --- | --- | --- |
| **Billed** | plain | Employee Navigator has a premium for this tier, because someone is enrolled in it. |
| **Calculated** | `calc.` | Nobody is enrolled in this tier, so nothing is billed for it anywhere. Derived at the program tier factors — EE 1.00 / EE+SP 2.00 / EE+CH 1.85 / EE+Family 2.85. Never contributes to a total. |
| **Manual** | blue, in Rate Admin | Keyed by hand from a carrier rate sheet. Beats both of the above. |

The tier factors hold up well against the billed data: of the 165 billed
non-employee tier rates in the export, 161 reconcile within the 0.5% relative
tolerance the app uses, and 155 are exact to the cent. The four that miss belong
to three plans — Forestry's EBPA Preferred Silver and EBPA Deluxe Platinum, and
Electrical Repair's EBPA Platinum 150. Those are flagged **Off schedule** in
Rate Admin, and their calculated tiers are described in the client-facing pages
as approximate pending the TPA rate sheet rather than as confident numbers.

Employer/employee split is **actual** — read from the Employee Navigator payroll
configuration — for groups whose export has been loaded, and is not adjustable
there. Groups without one show a "Pending" notice and placeholder percentages,
clearly labelled as such; their total premium is billed data and is correct.

## Known gaps

- Only Johnson Storage has its per-group EN export loaded; the other 68 groups
  show the pending-contribution notice. Loading the rest closes this.
- The EBPA and HealthEZ 2026 rate sheets would replace every `calc.` label with
  a published number.
- Gravie shows "quote requested" rather than invented rates. Surest is priced
  only where UnitedHealthcare included it.
- Rate Admin edits persist to the browser's `localStorage`, so they are local to
  whoever made them. Sharing them across the team needs a server-side store.

## Run

```bash
npm install
npm run dev      # Vite dev server; demo access codes are shown in dev only
npm run build    # type-check + production build to dist/public
npm run start    # serve the build on $PORT (default 5000)
```

## Deploy

Railway, nixpacks — see `railway.toml` / `railway.json`. `npm run build`
produces `dist/public`; `npm run start` serves it through a small Express
process with a `/healthz` check. No database and no environment variables are
required.
