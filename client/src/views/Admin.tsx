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

interface Props {
  data: KennionData;
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

export default function Admin({
  data,
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
  const { all, stats } = useMemo(() => {
    let nBilled = 0;
    let nManual = 0;
    let nCalc = 0;
    let nNone = 0;
    let nOff = 0;
    let totalCells = 0;

    const all = data.groups.flatMap((g) =>
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
  }, [data, overrides]);

  const q = query.trim().toLowerCase();
  const rows = all.filter(
    (r) =>
      (tpa === "All" || r.tpa === tpa) &&
      (!gapsOnly || r.missing > 0) &&
      (!q || `${r.group} ${r.plan}`.toLowerCase().includes(q)),
  );

  const kpis = [
    {
      label: "Groups",
      value: String(data.groups.length),
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
      note: stats.nManual ? "saved in this browser" : "none yet",
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
            <img src={Logo} alt="Kennion Benefit Advisors" style={{ height: 30, display: "block" }} />
            <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>
              Rate Administration
            </span>
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
      </div>

      <div style={{ maxWidth: 1680, margin: "0 auto", padding: "20px 22px 60px" }}>
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
              2026 rates &mdash; all groups, all plans
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
              of them to enter the real rate from the carrier sheet. Edits save in this browser and
              flow straight into the client-facing pages.
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
          <span style={{ fontSize: 12.5, color: C.faint, marginLeft: "auto" }}>
            {rows.length} of {all.length} plans
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
                <th style={{ ...th, textAlign: "right" }}>Lives</th>
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
      </div>
    </div>
  );
}
