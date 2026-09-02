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
export default function Reconciliation({ token, stats, groups, onStats }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
      {!stats && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: C.faint }}>
          No report uploaded yet. Once it is, this panel shows every carrier side by side with the XML.
        </div>
      )}
    </div>
  );
}
