import { useEffect, useState } from "react";
import { C, money0, panel } from "@/lib/importui";
import { pill } from "@/lib/ui";

interface CarrierRow {
  carrier: string;
  report: { enrolled: number; companies: number; monthly: number; rows?: number };
  portal: { monthly: number; heads: number; headsExact: boolean; groups: number; archivedMonthly: number };
  diff: number;
  pct: number | null;
  service: boolean;
  ok: boolean | null;
}

export interface Audit {
  generated: string;
  complete: boolean;
  files: {
    xml: { filename: string | null; when: string; companies: number } | null;
    stats: { filename: string | null; when: string; reportDate: string | null } | null;
    funding: { filename: string | null; when: string; month: string | null } | null;
  };
  portal: { groups: number; enrolled: number; groupHealthMonthly: number; totalMonthly: number };
  verdict: { kind: "ok" | "warn" | "none"; headline: string };
  carriers: CarrierRow[];
  billing: { month: string | null; groups: number; matches: number; differ: string[]; noBilling: string[]; unassigned: number } | null;
  read: string | null;
  readAt: string | null;
  reading: boolean;
  readError?: string | null;
}

interface Props {
  token: string;
  /** Bump to re-read after an upload. */
  version: number;
  ai: boolean;
}

const when = (s: string) => new Date(s).toLocaleString();
/** The first dozen names; the rest as a count. The sections below list them all. */
const few = (names: string[]) => (names.length <= 12 ? names.join(", ") : `${names.slice(0, 12).join(", ")} and ${names.length - 12} more`);

/**
 * The verdict on the snapshot, at the top of the Import tab. Computed on the
 * server after every upload; Claude's read arrives once all three files are
 * in and is kept, so nobody has to press anything.
 */
export default function AuditPanel({ token, version, ai }: Props) {
  const [audit, setAudit] = useState<Audit | null>(null);
  const [showRows, setShowRows] = useState(false);
  const [showRead, setShowRead] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const load = async (retry = false) => {
      try {
        const r = await fetch(`/api/admin/audit${retry ? "?read=1" : ""}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) return;
        const j = await r.json();
        if (cancelled) return;
        setAudit(j.audit);
        if (j.audit?.reading) timer = window.setTimeout(() => void load(), 4000);
      } catch {
        /* the page still shows the sections */
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [token, version]);

  if (!audit) return null;
  const v = audit.verdict;
  const tone = v.kind === "ok" ? pill(C.green, C.greenTint, C.greenEdge) : v.kind === "warn" ? pill(C.amber, C.amberTint, C.amberEdge) : pill(C.muted, C.zebra, C.hairline);
  const files = [
    ["XML export", audit.files.xml ? `${when(audit.files.xml.when)} · ${audit.files.xml.companies} companies` : "not yet"],
    ["Carrier stats", audit.files.stats ? `${when(audit.files.stats.when)}${audit.files.stats.reportDate ? ` · report of ${audit.files.stats.reportDate}` : ""}` : "not yet"],
    ["Funding workbook", audit.files.funding ? `${when(audit.files.funding.when)}${audit.files.funding.month ? ` · ${audit.files.funding.month}` : ""}` : "not yet"],
  ];

  return (
    <section style={{ ...panel, marginTop: 16, padding: "18px 22px", borderLeft: `4px solid ${v.kind === "ok" ? C.green : v.kind === "warn" ? C.amber : C.hairline}` }} aria-label="Audit">
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: C.ink }}>The snapshot, audited</h2>
        <span style={{ ...tone, marginLeft: "auto" }}>{v.kind === "ok" ? "In order" : v.kind === "warn" ? "Needs a look" : "Incomplete"}</span>
      </div>
      <p style={{ margin: "10px 0 0", fontSize: 14, color: C.ink, lineHeight: 1.6, maxWidth: 900 }}>{v.headline}</p>
      {audit.complete && (
        <p style={{ margin: "6px 0 0", fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
          Portal: {audit.portal.groups} groups · {audit.portal.enrolled.toLocaleString()} enrolled · {money0(audit.portal.groupHealthMonthly)} / mo group health ·{" "}
          {money0(audit.portal.totalMonthly)} / mo all lines.
        </p>
      )}
      <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "140px 1fr", rowGap: 4, columnGap: 12, fontSize: 12.5 }}>
        {files.map(([k, val]) => (
          <span key={k} style={{ display: "contents" }}>
            <span style={{ color: C.muted }}>{k}</span>
            <span style={{ color: val === "not yet" ? C.faint : C.body }}>{val}</span>
          </span>
        ))}
      </div>

      {audit.complete && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.hairline}` }}>
          <button
            onClick={() => setShowRead((s) => !s)}
            aria-expanded={showRead || !audit.read}
            style={{ background: "none", border: "none", padding: 0, fontSize: 13, fontWeight: 600, color: audit.read ? C.blue : C.ink, cursor: "pointer" }}
          >
            Claude&rsquo;s read{audit.read ? (showRead ? " ▾" : " ▸") : ""}
          </button>
          {audit.read ? (
            showRead && <div style={{ marginTop: 6, fontSize: 13, color: C.body, lineHeight: 1.65, whiteSpace: "pre-wrap", maxWidth: 900 }}>{audit.read}</div>
          ) : audit.reading ? (
            <div style={{ marginTop: 6, fontSize: 13, color: C.blue }}>Reading the three files now…</div>
          ) : audit.readError ? (
            <div style={{ marginTop: 6, fontSize: 13, color: C.red }}>
              Could not get a read: {audit.readError}.{" "}
              <button
                onClick={() => {
                  void fetch("/api/admin/audit?read=1", { headers: { Authorization: `Bearer ${token}` } })
                    .then((r) => r.json())
                    .then((j) => setAudit(j.audit));
                }}
                style={{ background: "none", border: "none", padding: 0, fontSize: 13, color: C.blue, cursor: "pointer" }}
              >
                Try again
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 6, fontSize: 13, color: C.faint }}>{ai ? "Not read yet." : "AI is off on this server (no API key), so the figures above stand on their own."}</div>
          )}
        </div>
      )}

      {audit.carriers.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button onClick={() => setShowRows((s) => !s)} aria-expanded={showRows} style={{ background: "none", border: "none", padding: 0, fontSize: 13, color: C.blue, cursor: "pointer" }}>
            {showRows ? "Hide the numbers" : "Show the numbers"}
          </button>
          {showRows && (
            <div style={{ overflowX: "auto", marginTop: 8 }}>
              <table style={{ borderCollapse: "collapse", fontSize: 12.5, minWidth: 640 }}>
                <thead>
                  <tr>
                    {["Carrier", "EN / mo", "Portal / mo", "Diff", "EN people", "Portal people", ""].map((h, i) => (
                      <th key={h + i} style={{ padding: "6px 8px", textAlign: i === 0 ? "left" : "right", fontSize: 11.5, color: C.muted, textTransform: "uppercase", letterSpacing: ".3px", borderBottom: `1px solid ${C.hairline}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {audit.carriers.map((c) => (
                    <tr key={c.carrier} style={{ color: c.service ? C.faint : C.ink }}>
                      <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.hairline}` }}>{c.carrier}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", borderBottom: `1px solid ${C.hairline}` }}>{money0(c.report.monthly)}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", borderBottom: `1px solid ${C.hairline}` }}>{money0(c.portal.monthly)}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", borderBottom: `1px solid ${C.hairline}`, color: c.ok === false ? C.red : C.body }}>
                        {c.service ? "—" : `${c.diff >= 0 ? "+" : "−"}${money0(Math.abs(c.diff))}${c.pct != null ? ` (${c.pct > 0 ? "+" : ""}${c.pct}%)` : ""}`}
                      </td>
                      <td style={{ padding: "6px 8px", textAlign: "right", borderBottom: `1px solid ${C.hairline}` }}>{c.report.enrolled.toLocaleString()}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", borderBottom: `1px solid ${C.hairline}` }}>{c.portal.heads.toLocaleString()}{c.portal.headsExact ? "" : "*"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", borderBottom: `1px solid ${C.hairline}` }}>
                        {c.service ? <span style={pill(C.muted, C.zebra, C.hairline)}>No premium</span> : c.ok ? <span style={pill(C.green, C.greenTint, C.greenEdge)}>Matches</span> : <span style={pill(C.red, C.redTint, C.redEdge)}>Check</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {audit.billing && (
                <div style={{ marginTop: 8, fontSize: 12.5, color: C.body }}>
                  Billing vs XML: {audit.billing.matches} of {audit.billing.groups} groups match
                  {audit.billing.differ.length ? ` · differ: ${few(audit.billing.differ)}` : ""}
                  {audit.billing.noBilling.length ? ` · no billing this month: ${few(audit.billing.noBilling)}` : ""}
                  {audit.billing.unassigned ? ` · ${audit.billing.unassigned} invoice${audit.billing.unassigned === 1 ? "" : "s"} not filed under a group` : ""}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
