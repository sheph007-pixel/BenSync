import {
  TIERS,
  factorsHold,
  hasActualSplit,
  money,
  money0,
  planDesign,
  rateFor,
  split,
  splitSource,
  type Group,
  type KennionData,
  type Overrides,
  type PlanRow,
} from "@/lib/model";
import { C, h2, num, panel, pill, sectionHead, smallPrimaryBtn, th } from "@/lib/ui";

/** Sections on this page, in order, for the "On this page" links. */
export const CURRENT_SECTIONS = [
  { id: "plans", label: "Plans in force" },
  { id: "summary", label: "Summary" },
  { id: "split", label: "Employer / employee split" },
  { id: "combined", label: "Combined" },
];

interface Props {
  data: KennionData;
  overrides: Overrides;
  g: Group;
  rows: PlanRow[];
  totals: { er: number; ee: number; total: number; enrolled: number };
  eePct: number;
  depPct: number;
  onOpenPlan: (plan: string) => void;
}

export default function Current({
  data,
  overrides,
  g,
  rows,
  totals,
  eePct,
  depPct,
  onOpenPlan,
}: Props) {
  const actual = hasActualSplit(data, g);

  const kpis = [
    { label: "Enrolled employees", value: String(g.enrolled), note: "medical, active" },
    { label: "Covered lives", value: String(g.lives), note: "employees + dependents" },
    { label: "Plans in force", value: String((g.plans || []).length), note: g.tpa },
    { label: "Monthly premium", value: money0(totals.total), note: "employer + employee" },
    { label: "Annualized", value: money0(totals.total * 12), note: "at current enrollment" },
  ];

  /** Note under a plan card's rate table, only when some tier is calculated. */
  const rateNote = (r: PlanRow): string => {
    if (!TIERS.some((t) => rateFor(overrides, g, r.p.plan, t.key).derived)) return "";
    const lead =
      "Tiers marked calc. have no one enrolled today, so no rate is billed for them. ";
    return factorsHold(overrides, g, r.p.plan)
      ? lead +
          "Shown at the program tier factors — EE 1.00, EE+SP 2.00, EE+CH 1.85, EE+Family 2.85 — which reconcile to every billed rate on this plan."
      : lead +
          `This plan is priced off the standard program schedule, so those tiers are approximate — calculated at the standard factors (EE 1.00, EE+SP 2.00, EE+CH 1.85, EE+Family 2.85) pending the ${r.p.tpa} rate sheet. They do not affect any total shown.`;
  };

  return (
    <div>
      <div id="plans" className="anchor" style={sectionHead}>
        <h2 style={h2}>Current Medical Plan(s)</h2>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(376px,1fr))",
          gap: 16,
        }}
      >
        {rows.map((r) => {
          const des = planDesign(data, r.p.plan);
          const note = rateNote(r);
          return (
            <div
              key={r.p.plan}
              className="panel"
              style={{ ...panel, display: "flex", flexDirection: "column" }}
            >
              <div style={{ padding: "14px 18px 12px", borderBottom: `1px solid ${C.rule}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
                  <span style={pill(C.blue, C.blueTint, C.blueEdge)}>{r.p.tpa}</span>
                  <span style={{ fontSize: 12.5, color: C.faint }}>
                    {r.p.enrolled} enrolled employees
                  </span>
                </div>
                <div style={{ fontSize: 17, fontWeight: 600, color: C.ink, lineHeight: 1.3 }}>
                  {r.p.plan}
                </div>
                <div
                  style={{ marginTop: 6, fontSize: 12.5, color: C.muted, lineHeight: 1.55 }}
                >
                  {des
                    ? `${des["Deductible"]} deductible · ${des["Out-of-Pocket Max"]} out-of-pocket max · PCP ${des["Primary Care Office Visits"] || ""}`
                    : "Plan design on file with your TPA"}
                </div>
              </div>

              <div style={{ padding: "4px 18px 0" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <tbody>
                    {TIERS.map((t) => {
                      const s = split(data, overrides, g, r.p.plan, t.key, eePct, depPct);
                      const dv = rateFor(overrides, g, r.p.plan, t.key).derived;
                      return (
                        <tr key={t.key}>
                          <td
                            style={{
                              padding: "9px 0",
                              color: C.body,
                              borderBottom: `1px solid ${C.hairline}`,
                            }}
                          >
                            {t.label} ({r.counts[t.key]})
                          </td>
                          <td
                            style={{
                              padding: "9px 6px",
                              textAlign: "right",
                              fontSize: 11,
                              color: C.ghost,
                              borderBottom: `1px solid ${C.hairline}`,
                            }}
                          >
                            {dv ? "calc." : ""}
                          </td>
                          <td
                            style={{
                              padding: "9px 0",
                              textAlign: "right",
                              fontWeight: 600,
                              color: C.ink,
                              borderBottom: `1px solid ${C.hairline}`,
                              ...num,
                            }}
                          >
                            {money(s.rate)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {note && (
                  <div
                    style={{
                      padding: "8px 0 0",
                      fontSize: 11.5,
                      lineHeight: 1.5,
                      color: C.ghost,
                    }}
                  >
                    {note}
                  </div>
                )}
              </div>

              <div style={{ padding: "14px 18px 0", marginTop: "auto" }}>
                {[
                  ["Total Monthly Employer Cost", r.er],
                  ["Total Monthly Employee Cost", r.ee],
                ].map(([label, v]) => (
                  <div
                    key={label as string}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      fontSize: 13,
                      padding: "5px 0",
                      color: C.body,
                    }}
                  >
                    <span>{label as string}</span>
                    <span style={{ fontWeight: 600, color: C.ink, ...num }}>
                      {money(v as number)}
                    </span>
                  </div>
                ))}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "baseline",
                    padding: "11px 0 0",
                    marginTop: 6,
                    borderTop: `1px solid ${C.border}`,
                  }}
                >
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>
                    Monthly Premium
                  </span>
                  <span
                    style={{
                      fontSize: 19,
                      fontWeight: 600,
                      color: C.ink,
                      letterSpacing: "-0.3px",
                      ...num,
                    }}
                  >
                    {money(r.total)}
                  </span>
                </div>
              </div>

              <div className="noprint" style={{ padding: "16px 18px 18px" }}>
                <button
                  onClick={() => onOpenPlan(r.p.plan)}
                  style={{ ...smallPrimaryBtn, width: "100%", padding: "9px 12px" }}
                >
                  Employee Cost Breakdown
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div
        id="summary"
        className="anchor"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(178px,1fr))",
          gap: 14,
          marginTop: 16,
        }}
      >
        {kpis.map((k) => (
          <div key={k.label} className="panel" style={{ ...panel, padding: "15px 16px" }}>
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

      <div id="split" className="panel anchor" style={{ ...panel, marginTop: 16, padding: "16px 18px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>
            Employer / employee split
          </span>
          {actual ? (
            <span style={pill(C.green, C.greenTint, C.greenEdge)}>
              Actual &mdash; from Employee Navigator
            </span>
          ) : (
            <span style={pill(C.amber, C.amberTint, C.amberEdge)}>
              Pending &mdash; Employee Navigator contribution data not yet loaded
            </span>
          )}
        </div>

        {actual ? (
          <>
            <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
              {rows.map((r) => {
                const perTier = TIERS.map((t) => {
                  if (!r.counts[t.key]) return null;
                  const s = split(data, overrides, g, r.p.plan, t.key, eePct, depPct);
                  return s.rate ? `${t.short} ${Math.round((s.er! / s.rate) * 100)}%` : null;
                })
                  .filter(Boolean)
                  .join(" · ");
                const blended = r.total ? `${Math.round((r.er / r.total) * 100)}%` : "—";
                return (
                  <div key={r.p.plan} style={{ fontSize: 13, color: C.body, ...num }}>
                    {r.p.plan} — employer share by tier {perTier} ·{" "}
                    <strong style={{ color: C.ink }}>{blended} blended</strong>
                  </div>
                );
              })}
            </div>
            <div
              style={{
                marginTop: 12,
                paddingTop: 11,
                borderTop: `1px solid ${C.rule}`,
                fontSize: 12.5,
                color: C.faint,
                lineHeight: 1.55,
              }}
            >
              {splitSource(data, g)}
            </div>
          </>
        ) : (
          <div
            style={{
              marginTop: 11,
              fontSize: 12.5,
              color: C.faint,
              lineHeight: 1.55,
              maxWidth: 840,
            }}
          >
            Your contribution setup is configured in Employee Navigator and is fixed — it is not
            something to model here. Until this group's export is loaded, the employer and employee
            columns below are placeholders at {eePct}% of employee coverage and {depPct}% of
            dependent coverage. Total premium is billed data and is correct as shown.
          </div>
        )}
      </div>

      <div id="combined" className="anchor" style={sectionHead}>
        <h2 style={h2}>Current Medical Plan(s) &mdash; Combined</h2>
      </div>

      <div className="panel" style={{ ...panel, padding: "4px 18px 16px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left" }}>
              <th style={{ ...th, padding: "12px 8px 11px 0" }}>Plan Name</th>
              <th style={{ ...th, textAlign: "right" }}>Lives</th>
              <th style={{ ...th, textAlign: "right" }}>Employer / mo</th>
              <th style={{ ...th, textAlign: "right" }}>Employee / mo</th>
              <th style={{ ...th, padding: "12px 0 11px 8px", textAlign: "right" }}>
                Monthly Premium
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.p.plan} style={{ background: i % 2 ? C.zebra : "#fff" }}>
                <td
                  style={{
                    padding: "11px 8px 11px 0",
                    color: C.ink,
                    borderBottom: `1px solid ${C.hairline}`,
                  }}
                >
                  {r.p.plan}
                </td>
                {[r.p.enrolled, r.er, r.ee, r.total].map((v, j) => (
                  <td
                    key={j}
                    style={{
                      padding: j === 3 ? "11px 0 11px 8px" : "11px 8px",
                      color: C.ink,
                      borderBottom: `1px solid ${C.hairline}`,
                      textAlign: "right",
                      ...num,
                    }}
                  >
                    {j === 0 ? v : money(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            gap: 16,
            padding: "14px 0 0",
          }}
        >
          <div style={{ fontSize: 12.5, color: C.faint }}>Records: {rows.length}</div>
          <div style={{ display: "flex", gap: 26, fontSize: 14, color: C.ink }}>
            <span>
              Total Lives: <strong style={num}>{totals.enrolled}</strong>
            </span>
            <span>
              Total Premium: <strong style={num}>{money(totals.total)}</strong>
            </span>
          </div>
        </div>

        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: `1px solid ${C.hairline}`,
            fontSize: 12.5,
            color: C.faint,
            lineHeight: 1.6,
          }}
        >
          Annualized total premium <strong style={{ color: C.ink }}>{money0(totals.total * 12)}</strong>.
          Enrollment and premium from the Employee Navigator export of 7/31/2026.{" "}
          {actual
            ? "Employer/employee split as configured in your Employee Navigator payroll setup — actual, not adjustable."
            : `Employer/employee split modeled at ${eePct}% of employee coverage / ${depPct}% of dependent coverage pending your contribution file.`}
        </div>
      </div>
    </div>
  );
}
