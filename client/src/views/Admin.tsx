import { useMemo } from "react";
import {
  TIERS,
  factorsHold,
  ovKey,
  rateFor,
  type KennionData,
  type Overrides,
} from "@/lib/model";
import { C, chip, Logo, num, panel, pill, textInput, th } from "@/lib/ui";
import { money0 } from "@/lib/model";
import Link from "@/lib/Link";
import { PATHS, navigate } from "@/lib/router";
import Footer from "@/views/Footer";
import ImportPanel from "@/views/ImportPanel";
import GroupsTable, { type AdminGroup } from "@/views/GroupsTable";
import GroupDetail from "@/views/GroupDetail";
import Proposals from "@/views/Proposals";
import Reconciliation, { portalComparable, reportGroupHealth, type CarrierStats, type ImportDiagnostics } from "@/views/Reconciliation";

interface Props {
  data: KennionData;
  token: string;
  durable: boolean;
  storage: string;
  saveState: "idle" | "saving" | "saved" | "error";
  onImported: (groups: unknown[], imports?: ImportRecord[]) => void;
  imports: ImportRecord[];
  /** Employee Navigator's carrier stats report, if one has been uploaded. */
  carrierStats: CarrierStats | null;
  /** Whether the server has an Anthropic key. */
  ai: boolean;
  onCarrierStats: (s: CarrierStats) => void;
  /** Which tab the address names. */
  tab: AdminTab;
  /** The company page open under /admin/groups/:name, if any. */
  openGroup: string | null;
  overrides: Overrides;
  query: string;
  tpa: string;
  gapsOnly: boolean;
  onQuery: (v: string) => void;
  onTpa: (v: string) => void;
  onToggleGaps: () => void;
  onSetOverride: (group: string, plan: string, census: string, raw: string) => void;
  onExport: () => void;
  onExit: () => void;
}

const cellBase = {
  width: "100%",
  padding: "6px 8px",
  fontSize: 13,
  textAlign: "right" as const,
  border: `1px solid ${C.border}`,
  borderRadius: 3,
  outline: "none",
  background: "#fff",
  ...num,
};

export type AdminTab = "groups" | "rates" | "proposals" | "import";

const TABS: { key: AdminTab; label: string; href: string }[] = [
  { key: "groups", label: "Groups", href: PATHS.groups },
  { key: "rates", label: "Existing Plans & Rates", href: PATHS.rates },
  { key: "proposals", label: "Proposals", href: PATHS.proposals },
  { key: "import", label: "Import", href: PATHS.import },
];

export interface ImportRecord {
  filename: string | null;
  uploaded_at: string;
  uploaded_by: string | null;
  companies_found: number;
  companies_applied: number;
  /** What the parser left out of this import and why (see server/en-parse.js). */
  diagnostics?: ImportDiagnostics | null;
}

export default function Admin({
  data,
  token,
  durable,
  storage,
  saveState,
  onImported,
  imports,
  carrierStats,
  onCarrierStats,
  ai,
  tab,
  openGroup,
  overrides,
  query,
  tpa,
  gapsOnly,
  onQuery,
  onTpa,
  onToggleGaps,
  onSetOverride,
  onExport,
  onExit,
}: Props) {
  /**
   * One roster rule for the whole admin: a group that is archived, or not on a
   * program carrier, is not in the portal — so it is not rate-administered
   * either. Plans & Rates used to iterate every group and disagreed with the
   * Groups tab's count.
   */
  const activeGroups = useMemo(
    () =>
      data.groups.filter(
        (g) =>
          !(g as unknown as { archived?: boolean }).archived &&
          (g as unknown as { eligible?: boolean }).eligible !== false,
      ),
    [data.groups],
  );

  const { all, stats } = useMemo(() => {
    let nBilled = 0;
    let nManual = 0;
    let nCalc = 0;
    let nNone = 0;
    let nOff = 0;
    let totalCells = 0;

    const all = activeGroups.flatMap((g) =>
      (g.plans || []).map((p) => {
        const billedMap = (g.rates || {})[p.plan] || {};
        const billedCount = TIERS.filter((t) => billedMap[t.census] != null).length;
        // A plan can only be judged off-schedule once two tiers are billed.
        const offSchedule = billedCount >= 2 && !factorsHold(overrides, g, p.plan);
        if (offSchedule) nOff++;

        const cells = TIERS.map((t) => {
          totalCells++;
          const ovRaw = overrides[ovKey(g.name, p.plan, t.census)];
          const billed = billedMap[t.census];
          const calc = rateFor(overrides, g, p.plan, t.key);

          if (ovRaw != null && String(ovRaw) !== "") {
            nManual++;
            return {
              census: t.census,
              value: String(ovRaw),
              placeholder: "",
              title: "Entered by hand",
              style: {
                ...cellBase,
                color: C.blue,
                fontWeight: 600,
                borderColor: "#9cbdf0",
                background: "#f5f9ff",
              },
            };
          }
          if (billed != null) {
            nBilled++;
            return {
              census: t.census,
              value: billed.toFixed(2),
              placeholder: "",
              title: "Billed rate from Employee Navigator",
              style: { ...cellBase, color: C.ink, fontWeight: 600, background: "#fbfcfc" },
            };
          }
          if (calc.rate != null) {
            nCalc++;
            return {
              census: t.census,
              value: "",
              placeholder: calc.rate.toFixed(2),
              title: offSchedule
                ? "Approximate — this plan is priced off the standard schedule. Key the real rate."
                : "Calculated at the program tier factors. Type over it with the billed rate.",
              style: {
                ...cellBase,
                color: C.blue,
                fontWeight: 600,
                borderColor: offSchedule ? "#ecc9a4" : C.border,
              },
            };
          }
          nNone++;
          return {
            census: t.census,
            value: "",
            placeholder: "—",
            title: "No rate on file and nothing to calculate from.",
            style: {
              ...cellBase,
              color: C.blue,
              fontWeight: 600,
              borderColor: C.redEdge,
              background: "#fefaf9",
            },
          };
        });

        const missing = cells.filter((c) => c.value === "").length;
        const noBasis = cells.every((c) => c.value === "" && c.placeholder === "—");
        const status = noBasis
          ? "No basis"
          : offSchedule
            ? "Off schedule"
            : missing === 0
              ? "Complete"
              : `${missing} calculated`;
        const tone: Record<string, [string, string, string]> = {
          Complete: [C.green, C.greenTint, C.greenEdge],
          "Off schedule": [C.amber, C.amberTint, C.amberEdge],
          "No basis": [C.red, C.redTint, C.redEdge],
        };
        const [fg, bg, bd] = tone[status] || [C.body, "#f2f4f5", "#e0e4e6"];

        return {
          group: g.name,
          code: g.code,
          plan: p.plan,
          tpa: p.tpa,
          enrolled: p.enrolled,
          cells,
          status,
          missing,
          statusStyle: pill(fg, bg, bd),
        };
      }),
    );

    return {
      all,
      stats: { nBilled, nManual, nCalc, nNone, nOff, totalCells },
    };
  }, [activeGroups, overrides]);

  const q = query.trim().toLowerCase();
  const rows = all.filter(
    (r) =>
      (tpa === "All" || r.tpa === tpa) &&
      (!gapsOnly || r.missing > 0) &&
      (!q || `${r.group} ${r.plan}`.toLowerCase().includes(q)),
  );

  /**
   * Where the medical premium sits, by carrier as the export named it. This
   * is the reconciliation for the Groups page's group-health figure: every
   * dollar is in exactly one row, and the rows say which are counted.
   */
  const audit = useMemo(() => {
    type Row = { key: string; label: string; counted: boolean; carriers: Set<string>; groups: Set<string>; plans: number; enrolled: number; monthly: number };
    const rows = new Map<string, Row>();
    const zero: { group: string; plan: string; enrolled: number }[] = [];
    const add = (key: string, label: string, counted: boolean, g: string, p: { plan: string; tpa?: string; enrolled?: number; monthly?: number }) => {
      const r = rows.get(key) || { key, label, counted, carriers: new Set<string>(), groups: new Set<string>(), plans: 0, enrolled: 0, monthly: 0 };
      r.carriers.add((p.tpa || "").trim() || "(blank)");
      r.groups.add(g);
      r.plans++;
      r.enrolled += p.enrolled || 0;
      r.monthly += p.monthly || 0;
      rows.set(key, r);
    };
    activeGroups.forEach((g) => {
      (g.plans || []).forEach((raw) => {
        const p = raw as unknown as { plan: string; tpa?: string; enrolled?: number; monthly?: number; program?: string | null; groupHealth?: boolean; assumed?: boolean };
        if ((p.enrolled || 0) > 0 && !((p.monthly || 0) > 0)) zero.push({ group: g.name, plan: p.plan, enrolled: p.enrolled || 0 });
        if (p.assumed) add("assumed", "Carrier not named on the plan — counted, because the group is EBPA / HealthEZ only", true, g.name, p);
        else if (p.program === "EBPA") add("EBPA", "EBPA", true, g.name, p);
        else if (p.program === "HealthEZ") add("HealthEZ", "HealthEZ", true, g.name, p);
        else if (p.program === "BCBS-AL") add("BCBS-AL", "BCBS of Alabama — not group health", false, g.name, p);
        else add("unknown", "Carrier not recognised — NOT counted", false, g.name, p);
      });
    });
    const order = ["EBPA", "HealthEZ", "assumed", "BCBS-AL", "unknown"];
    const list = [...rows.values()].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    const medical = list.reduce((n, r) => n + r.monthly, 0);
    const groupHealth = list.filter((r) => r.counted).reduce((n, r) => n + r.monthly, 0);
    return { list, zero, medical, groupHealth };
  }, [activeGroups]);

  const kpis = [
    {
      label: "Groups",
      value: String(activeGroups.length),
      note: `${all.length} plans in force`,
    },
    {
      label: "Rates billed",
      value: String(stats.nBilled),
      note: `of ${stats.totalCells} tier rates, from Employee Navigator`,
    },
    {
      label: "Entered by hand",
      value: String(stats.nManual),
      note: stats.nManual ? (storage === "postgres" ? "saved to the database" : "saved on the server") : "none yet",
    },
    {
      label: "Still calculated",
      value: String(stats.nCalc + stats.nNone),
      note: `${stats.nOff} on off-schedule plans`,
    },
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.page }}>
      <div style={{ background: "#fff", borderBottom: `1px solid ${C.border}`, padding: "0 22px" }}>
        <div
          style={{
            maxWidth: 1680,
            margin: "0 auto",
            height: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Link href={PATHS.groups} aria-label="Rate Administration home" style={{ display: "block" }}>
              <img src={Logo} alt="Kennion Benefit Advisors" style={{ height: 30, display: "block" }} />
            </Link>
            <Link
              href={PATHS.groups}
              style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, textDecoration: "none" }}
            >
              Rate Administration
            </Link>
          </div>
          <button
            onClick={onExit}
            style={{
              background: "none",
              border: "none",
              fontSize: 13.5,
              color: C.blue,
              cursor: "pointer",
              padding: 0,
            }}
          >
            Exit
          </button>
        </div>

        <nav
          aria-label="Rate Administration"
          style={{ maxWidth: 1680, margin: "0 auto", display: "flex", gap: 2 }}
        >
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              aria-current={tab === t.key ? "page" : undefined}
              style={{
                display: "block",
                borderBottom: `3px solid ${tab === t.key ? C.orange : "transparent"}`,
                padding: "0 15px 11px",
                fontSize: 13.5,
                fontWeight: tab === t.key ? 600 : 400,
                color: tab === t.key ? C.ink : C.body,
                textDecoration: "none",
              }}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>

      <div style={{ maxWidth: 1680, margin: "0 auto", padding: "20px 22px 60px" }}>
        {tab === "rates" && (
        <>
        <div
          style={{
            ...panel,
            padding: "20px 22px",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 20,
          }}
        >
          <div style={{ maxWidth: 900 }}>
            <h1
              style={{
                margin: 0,
                fontSize: 23,
                fontWeight: 600,
                color: C.ink,
                letterSpacing: "-0.2px",
              }}
            >
              Existing 2026 rates &mdash; all groups, all plans
            </h1>
            <div
              style={{
                marginTop: 8,
                fontSize: 13,
                color: C.muted,
                lineHeight: 1.65,
                textWrap: "pretty",
              }}
            >
              Every tier rate Kennion has on file. Rates billed through Employee Navigator are
              locked in black. Empty boxes show the schedule-calculated rate in grey — type over any
              of them to enter the real rate from the carrier sheet. Edits are saved
              {storage === "postgres"
                ? " to the database and shared with everyone at Kennion"
                : " on the server"}
              , and flow straight into the client-facing pages.
            </div>
          </div>
          <button
            onClick={onExport}
            style={{
              padding: "8px 16px",
              fontSize: 13.5,
              fontWeight: 500,
              color: "#fff",
              background: C.blue,
              border: `1px solid ${C.blue}`,
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Export rates
          </button>
        </div>


        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(178px,1fr))",
            gap: 14,
            marginTop: 16,
          }}
        >
          {kpis.map((k) => (
            <div key={k.label} style={{ ...panel, padding: "15px 16px" }}>
              <div style={{ fontSize: 12.5, color: C.muted }}>{k.label}</div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 24,
                  fontWeight: 600,
                  color: C.ink,
                  letterSpacing: "-0.4px",
                  ...num,
                }}
              >
                {k.value}
              </div>
              <div style={{ marginTop: 3, fontSize: 12, color: C.faint }}>{k.note}</div>
            </div>
          ))}
        </div>

        <div style={{ ...panel, marginTop: 16, padding: "16px 18px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.ink }}>
              Where the medical premium sits
            </h2>
            <span style={{ fontSize: 12.5, color: C.faint }}>
              {money0(audit.medical)} / mo across every medical plan · {money0(audit.groupHealth)} counted as group health
            </span>
          </div>
          <div style={{ marginTop: 6, fontSize: 12.5, color: C.muted, lineHeight: 1.6, maxWidth: 900 }}>
            The carrier is whatever the Employee Navigator export named on each plan. EBPA and HealthEZ
            are the captive program and make up the Groups page&rsquo;s group-health figure; BCBS of
            Alabama is left out on purpose. A carrier spelled in a way the rule does not recognise
            shows up as its own row here instead of vanishing — say so and it will be matched.
          </div>
          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: "left", padding: "10px 8px 9px 0" }}>Carrier</th>
                  <th style={{ ...th, textAlign: "left" }}>As named in the export</th>
                  <th style={{ ...th, textAlign: "right" }}>Groups</th>
                  <th style={{ ...th, textAlign: "right" }}>Plans</th>
                  <th style={{ ...th, textAlign: "right" }}>Enrolled</th>
                  <th style={{ ...th, textAlign: "right" }}>Monthly</th>
                  <th style={{ ...th, textAlign: "right", padding: "10px 0 9px 8px" }}>Group health?</th>
                </tr>
              </thead>
              <tbody>
                {audit.list.map((r) => (
                  <tr key={r.key} style={{ color: r.counted ? C.ink : C.body }}>
                    <td style={{ padding: "8px 8px 8px 0", borderBottom: `1px solid ${C.hairline}` }}>{r.label}</td>
                    <td style={{ padding: 8, borderBottom: `1px solid ${C.hairline}`, color: C.faint, fontSize: 12 }}>
                      {[...r.carriers].sort().join(" · ")}
                    </td>
                    <td style={{ padding: 8, borderBottom: `1px solid ${C.hairline}`, textAlign: "right", ...num }}>{r.groups.size}</td>
                    <td style={{ padding: 8, borderBottom: `1px solid ${C.hairline}`, textAlign: "right", ...num }}>{r.plans}</td>
                    <td style={{ padding: 8, borderBottom: `1px solid ${C.hairline}`, textAlign: "right", ...num }}>{r.enrolled.toLocaleString()}</td>
                    <td style={{ padding: 8, borderBottom: `1px solid ${C.hairline}`, textAlign: "right", fontWeight: 600, ...num }}>{money0(r.monthly)}</td>
                    <td style={{ padding: "8px 0 8px 8px", borderBottom: `1px solid ${C.hairline}`, textAlign: "right" }}>
                      <span style={r.counted ? pill(C.green, C.greenTint, C.greenEdge) : pill(C.faint, "#f2f4f5", "#e0e4e6")}>
                        {r.counted ? "Counted" : "Excluded"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {audit.zero.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 12.5, color: C.amber, lineHeight: 1.6 }}>
              <strong>{audit.zero.length} plan{audit.zero.length === 1 ? "" : "s"} with people enrolled but no billed premium</strong>{" "}
              — the export carried no PlanCost for them, so they add nothing to any total:{" "}
              {audit.zero.slice(0, 8).map((z) => `${z.group} — ${z.plan} (${z.enrolled})`).join("; ")}
              {audit.zero.length > 8 ? ` and ${audit.zero.length - 8} more` : ""}.
            </div>
          )}
        </div>

        <div
          style={{
            ...panel,
            marginTop: 16,
            padding: "12px 16px",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 10,
          }}
        >
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search group or plan"
            aria-label="Search group or plan"
            autoComplete="off"
            style={{ ...textInput, flex: 1, minWidth: 240, fontSize: 13.5, padding: "8px 11px" }}
          />
          <div style={{ display: "flex", gap: 2 }}>
            {["All", "EBPA", "HealthEZ"].map((t) => (
              <button key={t} onClick={() => onTpa(t)} style={chip(tpa === t)}>
                {t}
              </button>
            ))}
          </div>
          <button onClick={onToggleGaps} style={chip(gapsOnly)}>
            Needs a real rate
          </button>
          <span
            style={{
              fontSize: 12.5,
              marginLeft: "auto",
              color:
                saveState === "error" ? C.red : saveState === "saved" ? C.green : C.faint,
            }}
          >
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "Saved"
                : saveState === "error"
                  ? "Not saved — sign in again"
                  : `${rows.length} of ${all.length} plans`}
          </span>
        </div>

        <div style={{ ...panel, marginTop: 16, padding: "4px 18px 16px", overflowX: "auto" }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 1120 }}
          >
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th style={{ ...th, padding: "12px 8px 11px 0" }}>Group</th>
                <th style={th}>Plan</th>
                <th style={{ ...th, textAlign: "right" }} title="Employees enrolled in this plan — the same count the Groups page adds up per group">
                  Enrolled
                </th>
                {TIERS.map((t) => (
                  <th key={t.key} style={{ ...th, textAlign: "right", width: 112 }}>
                    {t.key === "EE"
                      ? "EE"
                      : t.key === "FAM"
                        ? "EE + Family"
                        : `EE + ${t.key === "ES" ? "SP" : "CH"}`}
                  </th>
                ))}
                <th style={{ ...th, padding: "12px 0 11px 8px" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.group}||${r.plan}`}>
                  <td
                    style={{
                      padding: "8px 8px 8px 0",
                      color: C.ink,
                      borderBottom: `1px solid ${C.hairline}`,
                      lineHeight: 1.4,
                    }}
                  >
                    {r.group}
                    <div style={{ fontSize: 11.5, color: C.ghost }}>{r.code}</div>
                  </td>
                  <td
                    style={{
                      padding: 8,
                      color: C.body,
                      borderBottom: `1px solid ${C.hairline}`,
                      lineHeight: 1.4,
                    }}
                  >
                    {r.plan}
                    <div style={{ fontSize: 11.5, color: C.ghost }}>{r.tpa}</div>
                  </td>
                  <td
                    style={{
                      padding: 8,
                      textAlign: "right",
                      color: C.body,
                      borderBottom: `1px solid ${C.hairline}`,
                      ...num,
                    }}
                  >
                    {r.enrolled}
                  </td>
                  {r.cells.map((c) => (
                    <td
                      key={c.census}
                      style={{ padding: "5px 4px", borderBottom: `1px solid ${C.hairline}` }}
                    >
                      <input
                        value={c.value}
                        placeholder={c.placeholder}
                        title={c.title}
                        aria-label={`${r.group} — ${r.plan} — ${c.census}`}
                        onChange={(e) =>
                          onSetOverride(r.group, r.plan, c.census, e.target.value)
                        }
                        inputMode="decimal"
                        autoComplete="off"
                        style={c.style}
                      />
                    </td>
                  ))}
                  <td style={{ padding: "8px 0 8px 8px", borderBottom: `1px solid ${C.hairline}` }}>
                    <span style={r.statusStyle}>{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div
          style={{
            marginTop: 14,
            fontSize: 12.5,
            color: C.faint,
            lineHeight: 1.6,
            maxWidth: 900,
            textWrap: "pretty",
          }}
        >
          Grey numbers are calculated at the program tier factors — EE 1.00, EE+SP 2.00, EE+CH 1.85,
          EE+Family 2.85. Those factors reconcile exactly on 97 of the 100 plans where two or more
          tiers are billed; the three that do not are flagged <strong>Off schedule</strong> and
          should be keyed by hand from the rate sheet.
        </div>
        </>
        )}

        {tab === "groups" &&
          (openGroup ? (
            (() => {
              const g = (data.groups as unknown as AdminGroup[]).find((x) => x.name === openGroup);
              return g ? (
                <GroupDetail
                  group={g}
                  token={token}
                  onChanged={(gs) => onImported(gs as unknown[])}
                  onBack={() => navigate(PATHS.groups)}
                  onOpenRates={(name) => {
                    onQuery(name);
                    onTpa("All");
                  }}
                />
              ) : (
                <div style={{ ...panel, marginTop: 16, padding: "20px 22px" }}>
                  <nav aria-label="Breadcrumb" style={{ fontSize: 13, marginBottom: 10 }}>
                    <Link href={PATHS.groups}>Groups</Link>
                  </nav>
                  <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: C.ink }}>
                    No group called &ldquo;{openGroup}&rdquo;
                  </h2>
                  <div style={{ marginTop: 8, fontSize: 13, color: C.muted, lineHeight: 1.65 }}>
                    The link may be out of date, or the company is filed under a different name.{" "}
                    <Link href={PATHS.groups}>Back to the Groups list</Link> to find it.
                  </div>
                </div>
              );
            })()
          ) : (
            <GroupsTable
              groups={data.groups as unknown as AdminGroup[]}
              token={token}
              onChanged={(gs) => onImported(gs as unknown[])}
              enReport={(() => {
                const r = reportGroupHealth(carrierStats);
                return r ? { ...r, comparable: portalComparable(data.groups as unknown as AdminGroup[]).monthly } : null;
              })()}
            />
          ))}

        {tab === "proposals" && (
          <Proposals
            token={token}
            groups={(data.groups as unknown as AdminGroup[]).filter(
              (g) => !g.archived && g.eligible !== false,
            )}
          />
        )}

        {tab === "import" && (
          <>
            <ImportPanel
              token={token}
              durable={durable}
              storage={storage}
              onImported={(gs, ims) => onImported(gs, ims as ImportRecord[] | undefined)}
            />

            <Reconciliation
              token={token}
              stats={carrierStats}
              groups={data.groups as unknown as AdminGroup[]}
              onStats={onCarrierStats}
              diagnostics={imports[0]?.diagnostics || null}
              lastImport={imports[0] ? { filename: imports[0].filename, when: imports[0].uploaded_at } : null}
              ai={ai}
            />

            <div style={{ ...panel, marginTop: 16, padding: "20px 22px" }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: C.ink }}>
                Import history
              </h2>
              {!imports?.length ? (
                <div style={{ marginTop: 10, fontSize: 13, color: C.faint }}>
                  Nothing imported yet. The portal is serving the shipped census.
                </div>
              ) : (
                <table
                  style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 12 }}
                >
                  <thead>
                    <tr>
                      <th style={{ ...th, textAlign: "left" }}>File</th>
                      <th style={{ ...th, textAlign: "left" }}>When</th>
                      <th style={{ ...th, textAlign: "left" }}>By</th>
                      <th style={{ ...th, textAlign: "right" }}>Found</th>
                      <th style={{ ...th, textAlign: "right" }}>Imported</th>
                    </tr>
                  </thead>
                  <tbody>
                    {imports.map((im, i) => (
                      <tr key={i}>
                        <td
                          style={{
                            padding: "8px 8px 8px 0",
                            borderBottom: `1px solid ${C.hairline}`,
                            color: C.ink,
                            overflowWrap: "anywhere",
                          }}
                        >
                          {im.filename || "(unnamed)"}
                        </td>
                        <td
                          style={{
                            padding: 8,
                            borderBottom: `1px solid ${C.hairline}`,
                            color: C.body,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {new Date(im.uploaded_at).toLocaleString()}
                        </td>
                        <td style={{ padding: 8, borderBottom: `1px solid ${C.hairline}`, color: C.body }}>
                          {im.uploaded_by || "—"}
                        </td>
                        <td
                          style={{
                            padding: 8,
                            borderBottom: `1px solid ${C.hairline}`,
                            textAlign: "right",
                            color: C.body,
                            ...num,
                          }}
                        >
                          {im.companies_found}
                        </td>
                        <td
                          style={{
                            padding: "8px 0 8px 8px",
                            borderBottom: `1px solid ${C.hairline}`,
                            textAlign: "right",
                            color: C.ink,
                            fontWeight: 600,
                            ...num,
                          }}
                        >
                          {im.companies_applied}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>

      <Footer />
    </div>
  );
}
