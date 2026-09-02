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

## Pages and addresses

The portal lives at **https://app.kennion.com**. Every page has its own address,
so the browser's back and forward buttons work, a page can be bookmarked or sent
as a link, and a reload comes back to the same place.

| Address | Page |
| --- | --- |
| `/` | Group sign-in |
| `/current` | Current Medical Plan(s) |
| `/options` | 2027 Medical Plan Options |
| `/admin` | Staff sign-in |
| `/admin/groups` | Rate Administration — Groups |
| `/admin/groups/<company name>` | One company's page |
| `/admin/rates` | Rate Administration — Plans & Rates |
| `/admin/import` | Rate Administration — Import |

Sections within a page are `#hash` anchors — `/options#shortlist`, say — and
each group page lists its sections under the heading as "On this page" links.
The company page carries a breadcrumb back to the Groups list and a link into
Plans & Rates filtered to that company.

Opening an address without a session shows the matching sign-in form (the
staff one for anything under `/admin`) and lands on that page afterwards. The
session is kept in the tab's `sessionStorage` — the group's own access code, or
the staff token, never any census data — so it survives a reload and ends when
the tab closes. A group at a staff address, or staff at a group address, is
sent to its own home page. The server answers every non-API path with the app,
so deep links work on a fresh load.

Kennion staff reach **Rate Administration** through the small "Admin" link under
the sign-in card, with an email and code. It has three tabs: **Groups** (the
roster, access codes, addresses and ALE buckets), **Plans & Rates** (every
group × plan × tier rate), and **Import** (upload an export, with the history of
what came in when).

Clicking a company name opens its own page: access code, ALE bucket, every
company detail as an editable field, contacts, plans in force, and where the
data came from. Edits are stored separately from the imported payload and
override it, so a correction is not undone by the next export. The company name
is deliberately **not** editable — it is the key an import matches on, so
renaming would orphan the group.

A group can be **archived**: it drops out of the list and its access code is
refused at sign-in, but nothing is deleted and it can be restored at any time.

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

Every group also carries a **Broker** label: **Kennion**, for groups Kennion
places directly, or **Outside Broker**. Seven groups ship labelled Outside
Broker; the label can be flipped on any group in the Groups table or on its
page, and the Groups table sorts and filters on it. Only the label is stored —
never the outside broker's name.

Each group also has a **2027 renewal** state for tracking — **Open** (the
default), **Sent**, **Renewed** or **Non-Renewed** — set from the Groups table
or the company page and saved like the other labels.

The Groups page opens with a dashboard that follows the filters: group count,
enrolled employees and covered lives, and monthly premium for whatever is on
screen — filter to a broker, a size band or a renewal state and the three
numbers describe that slice, with its share of the whole block. The renewal
tile counts each state within the current slice; click one to filter to it. The table below keeps to eight
columns — company and access code, location, contact, enrolled, **% of block**
(that group's enrolled employees as a share of every enrolled employee in the
portal, so concentration is visible at a glance), size, broker, renewal — with
the rest of each group's details on its own page. A totals row at the foot adds
up whatever is on screen and moves with every search, filter and sort, so
filtering to Outside Broker shows what share of the block those groups hold. The **Export** button downloads exactly those rows as a CSV that opens
in Excel, with every detail column included. Filter first, then export, and the
file is the report.

Enrollment is counted the same way everywhere: a group's enrolled figure on the
Groups page is the sum of the enrolled counts of its plans on Plans & Rates,
and both pages apply the same roster rule, so their group counts agree.

## Who is in the portal

The 2027 program covers **EBPA, HealthEZ and BCBS of Alabama**. A group is in
the portal only if it has at least one medical plan from one of those with
someone actually enrolled — a plan on the books with nobody on it does not
count. Anything else is refused at sign-in.

Carrier names arrive as free text from the Employee Navigator plan catalog, so
matching is tolerant: EBPA, HealthEZ in any spacing, and Blue Cross / Blue
Shield / BCBS / the Alabama "Blue Secure" and "Blue Choice" product families,
matched against the plan's TPA *and* its name.

One roster rule applies across the whole admin: a group that is archived, or
not on a program carrier, is not in the portal and is not rate-administered
either. It is excluded from Plans & Rates, from the group counts, and from the
rates export, so the tabs cannot disagree about how many groups there are.

An unmatched group is never silently dropped. It stays in Rate Administration
behind a **"Not in program"** filter, listing the carriers actually found on it,
so a program carrier under an unrecognised name is visible and can be added to
the rule.

## Proposals

Carrier proposals — UnitedHealthcare, Surest, Gravie, Nationwide, EBPA, HealthEZ,
BCBS of Alabama — are uploaded on the **Proposals** tab, a whole batch at once,
or one at a time from a company's page. The drop zone takes the proposal in
whatever form it came: a PDF, a spreadsheet, a Word file, a CSV, a picture of
a rate sheet — or the **email itself** (`.eml` from Gmail or Apple Mail, `.msg`
from Outlook). An email is opened on the server, each usable attachment becomes
a proposal of its own, and the email's subject, sender and body go along as
context for the match; logos and signature images are skipped, and an email
with nothing attached is read as the proposal itself. The email is kept too, so
the original can always be opened. Each file is stored whole in Postgres
(`kennion.proposals`) and then read by Claude (`claude-opus-5`, via the
Anthropic SDK) in the background: the carrier, the employer named on the
document, the effective date, every plan with its tier rates, and which roster
group it belongs to, with a confidence. A match at 85% or better is **assigned**
to the group; between 50% and 85% it is **suggested** and waits for a click to
confirm; below that the proposal sits in the **to assign** queue with a group
dropdown. Any assignment can be changed. Each group tracks four **slots** — UHC Fully
Insured, UHC Level Funded, Gravie and Nationwide (plus Surest and Other) — and
Claude fills the slot from the carrier and the funding type it reads; staff can
change it. When a newer proposal lands in a slot a group already has, the older
one is marked **superseded** and kept, so the current set is always the latest
from each carrier. That current set, stored in the database, is what the 2027
options for each group will be built from. The extraction is shown under
"Details" for review and is not pushed into the rate tables. The tab has two
layouts: a list, and **By group**, which walks the roster with each group's
proposals attached and ends with the groups still waiting on one. The Groups
page shows a proposal count under each company and can filter to groups with or
without one. Claude also audits
what it reads against the roster — a proposal priced on a very different
headcount than the group's, or a document that names a different company than
the page it was uploaded to, is flagged.

Reading needs an Anthropic key in the environment — `ANTHROPIC_API_KEY`, or
`CLAUDE` as it was first added to Railway. Without it uploads are
still stored and a filename that names a group is used as a hint; staff assign
the rest by hand. Without `DATABASE_URL` proposals live in memory until the next
deploy, and the screen says so.

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
carrier comes from the `<Plans>` catalog. The `<Company>` record supplies the
full group identity — address, city, state, ZIP, SIC code, EIN, phone, situs
state, corporation type and the named contacts. The one thing it lacks is the
SIC *description*, which is carried across from the census on import rather
than being lost. Plan names have their trailing year stripped so they match the census.

### What an import does and does not overwrite

An imported company is matched to an existing group by name, and if that fails,
by a **normalised** name — punctuation and legal-form words removed — so
"Aesto Health, LLC" updates "Aesto Health" instead of landing beside it as a
second copy of the same client. The match is verified not to merge any two of
the 68 census groups. The existing group's name stays the key, because access
codes, hand-keyed rates and ALE buckets are all filed under it; the export's own
spelling is kept alongside and shown in the table.

Rows that are the same client under two names — created before this matching
existed — are flagged in the Groups table with the row they duplicate, so the
stale one can be archived.

An import **never removes a group**. Only the companies you tick are touched;
every other group is left exactly as it was, so a partial export cannot wipe the
roster. Staff edits live in their own tables and survive imports untouched:
hand-assigned access codes, ALE buckets and hand-keyed rates all persist.

Within a group that you do import, the enrollment **is replaced** rather than
merged, and that is deliberate. An export is a snapshot: if someone terminated
since the last one, merging would leave them enrolled forever and every total
would drift upward. Replacing the group means its census matches the export you
just uploaded.

The Groups table shows, per group, whether its data came from an XML import and
when, or is still the shipped census.

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
| `kennion.imports` | one row per upload — filename, when, by whom, companies found and applied |
| `kennion.proposals` | one row per carrier proposal — the file itself, what Claude read off it, the group it is assigned to and by whom |

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
and `ADMIN_CODE` for staff sign-in, `ANTHROPIC_API_KEY` (or `CLAUDE`) so uploaded
proposals are read and matched to groups, `DATA_DIR` for a writable volume when there is
no database, and `PORT` (defaults to 5000). Set the admin values in Railway
so the real credentials are not the ones committed here.
