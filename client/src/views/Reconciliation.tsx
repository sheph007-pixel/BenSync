import { useRef, useState } from "react";
import { C, money0, panel } from "@/lib/importui";
import { pill } from "@/lib/ui";
import { carrierKey, matchCarrier } from "@/lib/carriers";
import type { AdminGroup } from "@/views/GroupsTable";

/** Employee Navigator's Carrier Stats report, as stored. */
export interface CarrierStats {
  filename: string;
  reportDate: string | null;
  rows: { carrier: string; eligible: number; enrolled: number; companies: number; plans: number; employeeCosts: number; planCosts: number }[];
  total: { employeeCosts: number; planCosts: number } | null;
  uploadedAt: string;
  uploadedBy: string | null;
}

/** What the last import left out, and why. Aggregates by carrier program. */
export interface ImportDiagnostics {
  employees: { total: number; byStatus: Record<string, number>; skipped: Record<string, number> };
  medical: {
    kept: { n: number; premium: number };
    excluded: Record<"terminatedEmployee" | "ended" | "waived", { n: number; premium: number; byProgram: Record<string, { n: number; premium: number }> }>;
    noPremium: { n: number; byProgram: Record<string, number> };
    endDates: { nil: number; absent: number; past: number; future: number };
  };
}

const REASON_LABEL: Record<string, string> = {
  terminatedEmployee: "Terminated employee whose medical coverage has not ended",
  ended: "Medical enrollment that has ended (EndDate in the past)",
  waived: "Waived or declined medical election",
};

type Plan = { plan: string; tpa?: string; enrolled?: number; monthly?: number; program?: string | null; groupHealth?: boolean; assumed?: boolean };
type Line = { benefit: string; carrier: string; plan: string; enrolled: number; monthly: number };

interface Recon {
  carrier: string;
  program: string | null;
  report: { enrolled: number; companies: number; monthly: number };
  portal: { enrolled: number; groups: number; monthly: number; assumedMonthly: number } | null;
  pending: boolean; // supplemental line, but no group has lines loaded yet
  service: boolean; // no premium either side — an administrator, not a carrier
  ok: boolean | null;
}

/** Group health as the report states it: EBPA + HealthEZ. */
export function reportGroupHealth(stats: CarrierStats | null) {
  if (!stats) return null;
  const gh = stats.rows.filter((r) => {
    const p = matchCarrier(r.carrier);
    return p === "EBPA" || p === "HealthEZ";
  });
  return { enrolled: gh.reduce((n, r) => n + r.enrolled, 0), monthly: gh.reduce((n, r) => n + r.planCosts, 0) };
}

const close = (a: number, b: number, tolFrac: number, tolAbs: number) => Math.abs(a - b) <= Math.max(tolAbs, tolFrac * Math.abs(b));

/** Every carrier in the report against what the portal holds from the XML. */
export function reconcile(stats: CarrierStats, groups: AdminGroup[]): Recon[] {
  const linesLoaded = groups.some((g) => (g as unknown as { linesLoaded?: boolean }).linesLoaded);
  return stats.rows.map((r) => {
    const program = matchCarrier(r.carrier);
    const report = { enrolled: r.enrolled, companies: r.companies, monthly: r.planCosts };
    let portal: Recon["portal"] = null;
    let pending = false;
    if (program) {
      const gs = new Set<string>();
      let enrolled = 0;
      let monthly = 0;
      let assumedMonthly = 0;
      groups.forEach((g) => {
        ((g.plans || []) as Plan[]).forEach((p) => {
          const counts = p.program === program || (p.assumed && program !== "BCBS-AL" && !p.program);
          if (!counts) return;
          gs.add(g.name);
          enrolled += p.enrolled || 0;
          monthly += p.monthly || 0;
          if (p.assumed) assumedMonthly += p.monthly || 0;
        });
      });
      portal = { enrolled, groups: gs.size, monthly, assumedMonthly };
    } else if (!linesLoaded) {
      pending = true;
    } else {
      const want = carrierKey(r.carrier);
      const gs = new Set<string>();
      let enrolled = 0;
      let monthly = 0;
      groups.forEach((g) => {
        (((g as unknown as { lines?: Line[] }).lines || []) as Line[]).forEach((l) => {
          if (carrierKey(l.carrier) !== want) return;
          gs.add(g.name);
          enrolled += l.enrolled || 0;
          monthly += l.monthly || 0;
        });
      });
      portal = { enrolled, groups: gs.size, monthly, assumedMonthly: 0 };
    }
    const service = report.monthly === 0 && (!portal || portal.monthly === 0);
    const ok =
      portal && !service
        ? close(portal.monthly, report.monthly, 0.01, 50) && close(portal.enrolled, report.enrolled, 0.01, 2)
        : null;
    return { carrier: r.carrier, program, report, portal, pending, service, ok };
  });
}

interface Props {
  token: string;
  stats: CarrierStats | null;
  /** The live roster, with classified plans and lines. */
  groups: AdminGroup[];
  onStats: (s: CarrierStats) => void;
  diagnostics?: ImportDiagnostics | null;
  lastImport?: { filename: string | null; when: string } | null;
  ai?: boolean;
}

const cell = (right = false): React.CSSProperties => ({
  padding: "8px 8px",
  borderBottom: `1px solid ${C.hairline}`,
  textAlign: right ? "right" : "left",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
});

const diff = (portal: number, report: number, money = false) => {
  const d = portal - report;
  if (Math.abs(d) < (money ? 0.5 : 0.5)) return <span style={{ color: C.green }}>match</span>;
  const s = money ? money0(Math.abs(d)) : Math.abs(d).toLocaleString();
  return <span style={{ color: d < 0 ? C.red : C.amber }}>{d < 0 ? "−" : "+"}{s}</span>;
};

/**
 * Second upload on the Import tab: Employee Navigator's Carrier Stats report,
 * kept alongside the XML so the two can be checked against each other.
 */
export default function Reconciliation({ token, stats, groups, onStats, diagnostics, lastImport, ai }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState("");

  async function explain(rows: Recon[]) {
    setExplaining(true);
    setExplanation("");
    try {
      const portal = rows.map((r) => ({ carrier: r.carrier, program: r.program, report: r.report, portal: r.portal, pending: r.pending }));
      const r = await fetch("/api/admin/reconcile/explain", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ portal }),
      });
      const j = await r.json().catch(() => ({ error: `Server returned ${r.status}.` }));
      setExplanation(r.ok ? j.text : `Could not get an explanation: ${j.error}`);
    } finally {
      setExplaining(false);
    }
  }

  /** Pull the reconciliation file down with the staff token and hand it to the browser. */
  async function download() {
    const r = await fetch("/api/admin/reconcile/export", { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) {
      setError("Could not build the reconciliation file — sign in again.");
      return;
    }
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kennion-reconciliation-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async function upload(f: File) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/admin/carrier-stats?filename=${encodeURIComponent(f.name)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": f.type || "application/octet-stream" },
        body: f,
      });
      const j = await r.json().catch(() => ({ error: `Server returned ${r.status}.` }));
      if (!r.ok) setError(j.error || "Could not read the report.");
      else onStats(j.stats);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }

  const rows = stats ? reconcile(stats, groups) : [];
  const gh = reportGroupHealth(stats);
  const portalGh = {
    enrolled: groups.reduce((n, g) => n + ((g as unknown as { groupHealthEnrolled?: number }).groupHealthEnrolled ?? 0), 0),
    monthly: groups.reduce((n, g) => n + ((g as unknown as { groupHealthMonthly?: number }).groupHealthMonthly ?? 0), 0),
  };
  const checked = rows.filter((r) => r.ok !== null);
  const mismatches = checked.filter((r) => r.ok === false);

  return (
    <div style={{ ...panel, marginTop: 16, padding: "20px 22px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: C.ink }}>Carrier stats report</h2>
        {stats && (
          <span style={{ fontSize: 12.5, color: C.faint }}>
            {stats.filename}
            {stats.reportDate ? ` · report of ${stats.reportDate}` : ""} · uploaded {new Date(stats.uploadedAt).toLocaleString()}
            {stats.uploadedBy ? ` by ${stats.uploadedBy}` : ""}
          </span>
        )}
      </div>
      <div style={{ marginTop: 8, fontSize: 13, color: C.muted, lineHeight: 1.65, maxWidth: 880 }}>
        The second file from Employee Navigator: its own count of enrolled employees, companies and
        monthly premium per carrier. Upload it with each XML export and the two are checked against
        each other below — every carrier the report names, against what the XML import produced.
      </div>

      <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <input
          ref={ref}
          type="file"
          accept=".xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
          aria-label="Upload the carrier stats report"
          disabled={busy}
          style={{ fontSize: 13 }}
        />
        <span style={{ fontSize: 12.5, color: C.faint }}>{busy ? "Reading…" : "carrier_stats_report_….xls, as Employee Navigator exports it"}</span>
      </div>
      {error && (
        <div role="alert" style={{ marginTop: 10, padding: "9px 12px", background: C.redTint, border: `1px solid ${C.redEdge}`, borderRadius: 4, fontSize: 13, color: C.red }}>
          {error}
        </div>
      )}

      {stats && gh && (
        <>
          <div
            style={{
              marginTop: 16,
              padding: "12px 14px",
              background: mismatches.length ? C.amberTint : C.greenTint,
              border: `1px solid ${mismatches.length ? C.amberEdge : C.greenEdge}`,
              borderRadius: 4,
              fontSize: 13,
              color: C.ink,
              lineHeight: 1.7,
            }}
          >
            <strong>Group health (EBPA + HealthEZ)</strong> — Employee Navigator reports{" "}
            <strong>{gh.enrolled.toLocaleString()} enrolled · {money0(gh.monthly)} / mo</strong>; the portal holds{" "}
            <strong>{portalGh.enrolled.toLocaleString()} enrolled · {money0(portalGh.monthly)} / mo</strong>{" "}
            ({diff(portalGh.enrolled, gh.enrolled)} enrolled, {diff(portalGh.monthly, gh.monthly, true)} premium).
            <div style={{ fontSize: 12.5, color: C.muted }}>
              {checked.length} carrier{checked.length === 1 ? "" : "s"} checked ·{" "}
              {mismatches.length ? `${mismatches.length} off by more than 1% — re-import the XML, then look at the rows marked Check` : "all within 1%"}
            </div>
          </div>

          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={{ ...cell(), fontWeight: 600, color: C.muted, fontSize: 12, textTransform: "uppercase" }}>Carrier</th>
                  <th style={{ ...cell(true), fontWeight: 600, color: C.muted, fontSize: 12, textTransform: "uppercase" }}>EN enrolled</th>
                  <th style={{ ...cell(true), fontWeight: 600, color: C.muted, fontSize: 12, textTransform: "uppercase" }}>Portal</th>
                  <th style={{ ...cell(true), fontWeight: 600, color: C.muted, fontSize: 12, textTransform: "uppercase" }}>Diff</th>
                  <th style={{ ...cell(true), fontWeight: 600, color: C.muted, fontSize: 12, textTransform: "uppercase" }}>EN companies</th>
                  <th style={{ ...cell(true), fontWeight: 600, color: C.muted, fontSize: 12, textTransform: "uppercase" }}>Portal</th>
                  <th style={{ ...cell(true), fontWeight: 600, color: C.muted, fontSize: 12, textTransform: "uppercase" }}>EN monthly</th>
                  <th style={{ ...cell(true), fontWeight: 600, color: C.muted, fontSize: 12, textTransform: "uppercase" }}>Portal</th>
                  <th style={{ ...cell(true), fontWeight: 600, color: C.muted, fontSize: 12, textTransform: "uppercase" }}>Diff</th>
                  <th style={{ ...cell(true), fontWeight: 600, color: C.muted, fontSize: 12, textTransform: "uppercase" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.carrier} style={{ color: r.service ? C.faint : C.ink }}>
                    <td style={{ ...cell(), whiteSpace: "normal" }}>
                      {r.carrier}
                      {r.program && (
                        <span style={{ fontSize: 11.5, color: r.program === "BCBS-AL" ? C.faint : C.green }}>
                          {" "}
                          · {r.program === "BCBS-AL" ? "medical, not group health" : "group health"}
                        </span>
                      )}
                    </td>
                    <td style={cell(true)}>{r.report.enrolled.toLocaleString()}</td>
                    <td style={cell(true)}>{r.portal ? r.portal.enrolled.toLocaleString() : "—"}</td>
                    <td style={cell(true)}>{r.portal && !r.service ? diff(r.portal.enrolled, r.report.enrolled) : ""}</td>
                    <td style={cell(true)}>{r.report.companies}</td>
                    <td style={cell(true)}>{r.portal ? r.portal.groups : "—"}</td>
                    <td style={cell(true)}>{money0(r.report.monthly)}</td>
                    <td style={cell(true)}>
                      {r.portal ? money0(r.portal.monthly) : "—"}
                      {r.portal && r.portal.assumedMonthly > 0 && (
                        <div style={{ fontSize: 11, color: C.amber }}>incl. {money0(r.portal.assumedMonthly)} assumed</div>
                      )}
                    </td>
                    <td style={cell(true)}>{r.portal && !r.service ? diff(r.portal.monthly, r.report.monthly, true) : ""}</td>
                    <td style={cell(true)}>
                      {r.service ? (
                        <span style={pill(C.faint, "#f2f4f5", "#e0e4e6")}>No premium</span>
                      ) : r.pending ? (
                        <span style={pill(C.amber, C.amberTint, C.amberEdge)} title="Supplemental lines are read from the XML on the next import">
                          After next import
                        </span>
                      ) : r.ok ? (
                        <span style={pill(C.green, C.greenTint, C.greenEdge)}>Matches</span>
                      ) : (
                        <span style={pill(C.red, C.redTint, C.redEdge)}>Check</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {stats.total && (
                <tfoot>
                  <tr>
                    <td style={{ ...cell(), fontWeight: 600 }}>Report total</td>
                    <td colSpan={5} />
                    <td style={{ ...cell(true), fontWeight: 600 }}>{money0(stats.total.planCosts)}</td>
                    <td colSpan={3} style={{ ...cell(), color: C.faint, fontSize: 12 }}>
                      every line, every carrier — employee share {money0(stats.total.employeeCosts)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
      {diagnostics && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.rule}` }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 12 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.ink }}>What the last XML import left out</h3>
            {lastImport && (
              <span style={{ fontSize: 12.5, color: C.faint }}>
                {lastImport.filename || "export"} · {new Date(lastImport.when).toLocaleString()} ·{" "}
                {diagnostics.employees.total.toLocaleString()} employees in the file
              </span>
            )}
          </div>
          <div style={{ marginTop: 6, fontSize: 12.5, color: C.muted, lineHeight: 1.6, maxWidth: 880 }}>
            Every medical enrollment the parser did not count, by the rule that excluded it and the
            carrier it was on, with the premium it carried. This is the bridge between the report&rsquo;s
            numbers and the portal&rsquo;s: a gap should be accounted for here.
          </div>
          <div style={{ overflowX: "auto", marginTop: 8 }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12.5, minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={{ ...cell(), color: C.muted, fontWeight: 600, whiteSpace: "normal" }}>Left out because</th>
                  {["EBPA", "HealthEZ", "BCBS-AL", "Other"].map((p) => (
                    <th key={p} style={{ ...cell(true), color: C.muted, fontWeight: 600 }}>{p === "BCBS-AL" ? "BCBS AL" : p}</th>
                  ))}
                  <th style={{ ...cell(true), color: C.muted, fontWeight: 600 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(REASON_LABEL) as (keyof ImportDiagnostics["medical"]["excluded"])[]).map((k) => {
                  const b = diagnostics.medical.excluded[k];
                  if (!b) return null;
                  return (
                    <tr key={k} style={{ color: b.n ? C.ink : C.faint }}>
                      <td style={{ ...cell(), whiteSpace: "normal" }}>{REASON_LABEL[k]}</td>
                      {["EBPA", "HealthEZ", "BCBS-AL", "Other"].map((p) => {
                        const v = b.byProgram[p];
                        return (
                          <td key={p} style={cell(true)}>
                            {v ? `${v.n} · ${money0(v.premium)}` : "—"}
                          </td>
                        );
                      })}
                      <td style={{ ...cell(true), fontWeight: 600 }}>{b.n ? `${b.n} · ${money0(b.premium)}` : "—"}</td>
                    </tr>
                  );
                })}
                <tr style={{ color: diagnostics.medical.noPremium.n ? C.amber : C.faint }}>
                  <td style={{ ...cell(), whiteSpace: "normal" }}>Counted as enrolled, but no PlanCost in the file (adds $0)</td>
                  {["EBPA", "HealthEZ", "BCBS-AL", "Other"].map((p) => (
                    <td key={p} style={cell(true)}>{diagnostics.medical.noPremium.byProgram[p] ?? "—"}</td>
                  ))}
                  <td style={{ ...cell(true), fontWeight: 600 }}>{diagnostics.medical.noPremium.n || "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: C.faint, lineHeight: 1.6 }}>
            Counted: {diagnostics.medical.kept.n.toLocaleString()} medical enrollments · {money0(diagnostics.medical.kept.premium)} / mo.
            {" "}Employees by status: {Object.entries(diagnostics.employees.byStatus).map(([k, n]) => `${k} ${n}`).join(" · ")}.
            {" "}Medical EndDate: {diagnostics.medical.endDates.nil} nil · {diagnostics.medical.endDates.absent} absent · {diagnostics.medical.endDates.future} future · {diagnostics.medical.endDates.past} past.
          </div>
        </div>
      )}

      {stats && (
        <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => void explain(rows)}
            disabled={explaining || !ai}
            title={ai ? "Send the report, the portal totals and the import diagnostics to Claude for a plain-language explanation" : "Needs ANTHROPIC_API_KEY on the server"}
            style={{
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 500,
              color: "#fff",
              background: C.blue,
              border: `1px solid ${C.blue}`,
              borderRadius: 4,
              cursor: explaining || !ai ? "default" : "pointer",
              opacity: explaining || !ai ? 0.6 : 1,
            }}
          >
            {explaining ? "Claude is reading…" : "Ask Claude what explains the gap"}
          </button>
          <button
            onClick={() => void download()}
            title="A small JSON file with the report, the portal totals by carrier, the import exclusions and each group's plan classification — no employee data. Attach it to a chat with Claude Code to have the reconciliation done outside this server."
            style={{
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 500,
              color: C.blue,
              background: "#fff",
              border: `1px solid ${C.blue}`,
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Download reconciliation file
          </button>
          <span style={{ fontSize: 12, color: C.faint }}>Aggregates only — no member data leaves the server.</span>
        </div>
      )}
      {explanation && (
        <div style={{ marginTop: 10, padding: "12px 14px", background: C.blueTint, border: `1px solid ${C.blueEdge}`, borderRadius: 4, fontSize: 13, color: C.ink, lineHeight: 1.65, whiteSpace: "pre-wrap", maxWidth: 900 }}>
          {explanation}
        </div>
      )}
      {!stats && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: C.faint }}>
          No report uploaded yet. Once it is, this panel shows every carrier side by side with the XML.
        </div>
      )}
    </div>
  );
}
