import { useCallback, useEffect, useMemo, useState } from "react";
import {
  TIERS,
  fmtDate,
  ovKey,
  planRows,
  rateFor,
  type Freq,
  type KennionData,
  type Overrides,
} from "@/lib/model";
import { C, Logo, panel, smallPrimaryBtn } from "@/lib/ui";
import Login from "@/views/Login";
import Footer from "@/views/Footer";
import Admin from "@/views/Admin";
import Current from "@/views/Current";
import Options, { type SortKey } from "@/views/Options";
import BreakdownModal from "@/views/BreakdownModal";

/**
 * Placeholder employer-contribution percentages, used only for groups whose
 * Employee Navigator export has not been loaded. Where EN data exists the real
 * split is used and these are ignored entirely.
 */
const EE_PCT = 80;
const DEP_PCT = 32;

const OVERRIDES_KEY = "kennion.rateOverrides";

export default function App() {
  const [data, setData] = useState<KennionData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState(false);
  const [mode, setMode] = useState<"group" | "staff">("group");
  const [email, setEmail] = useState("");
  const [staffCode, setStaffCode] = useState("");
  const [staffError, setStaffError] = useState(false);

  const [tab, setTab] = useState<"current" | "2027">("current");
  const [modalPlan, setModalPlan] = useState<string | null>(null);
  const [freq, setFreq] = useState<Freq["key"]>("M");

  const [sort, setSort] = useState<SortKey>("monthly");
  const [dir, setDir] = useState(1);
  const [gridQuery, setGridQuery] = useState("");
  const [carriers, setCarriers] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);

  const [admin, setAdmin] = useState(false);
  const [adminQuery, setAdminQuery] = useState("");
  const [adminTpa, setAdminTpa] = useState("All");
  const [gapsOnly, setGapsOnly] = useState(false);
  const [overrides, setOverrides] = useState<Overrides>({});

  useEffect(() => {
    try {
      setOverrides(JSON.parse(window.localStorage.getItem(OVERRIDES_KEY) || "{}") || {});
    } catch {
      setOverrides({});
    }
  }, []);

  /**
   * Sign in against the server. The census is not public, so a code buys
   * exactly one group's data (or, for the admin code, a PII-free rate table).
   */
  const signIn = useCallback(async (payload: { code: string; email?: string }) => {
    const staff = payload.email != null;
    if (!payload.code.trim() && !staff) return;
    setBusy(true);
    setCodeError(false);
    setStaffError(false);
    try {
      const r = await fetch("/api/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        if (staff) setStaffError(true);
        else setCodeError(true);
        return;
      }
      const p = await r.json();
      if (p.kind === "admin") {
        setData({
          meta: p.meta,
          groups: p.groups,
          planDesigns: p.planDesigns,
          uhc: { detail: {}, summary: {}, menu: [], mapping: [] },
          splits: {},
        } as KennionData);
        setAdmin(true);
      } else {
        setData({
          meta: p.meta,
          groups: [p.group],
          planDesigns: p.planDesigns,
          uhc: p.uhc,
          splits: p.splits,
        } as KennionData);
        setCode(p.group.code);
      }
    } catch {
      setLoadError(true);
    } finally {
      setBusy(false);
    }
  }, []);

  const setOverride = useCallback(
    (group: string, plan: string, census: string, raw: string) => {
      setOverrides((prev) => {
        const next = { ...prev };
        const k = ovKey(group, plan, census);
        if (raw.trim() === "") delete next[k];
        else next[k] = raw;
        try {
          window.localStorage.setItem(OVERRIDES_KEY, JSON.stringify(next));
        } catch {
          /* private browsing — edits stay in memory for this session */
        }
        return next;
      });
    },
    [],
  );

  const g = useMemo(
    () => (data && code ? data.groups.find((x) => x.code === code) || null : null),
    [data, code],
  );

  const rows = useMemo(
    () => (data && g ? planRows(data, overrides, g, EE_PCT, DEP_PCT) : []),
    [data, overrides, g],
  );

  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => ({
          er: a.er + r.er,
          ee: a.ee + r.ee,
          total: a.total + r.total,
          enrolled: a.enrolled + (r.p.enrolled || 0),
        }),
        { er: 0, ee: 0, total: 0, enrolled: 0 },
      ),
    [rows],
  );

  const submit = () => void signIn({ code: codeInput });
  const staffSubmit = () => void signIn({ email, code: staffCode });

  const signOut = () => {
    setData(null);
    setMode("group");
    setEmail("");
    setStaffCode("");
    setStaffError(false);
    setCode(null);
    setCodeInput("");
    setTab("current");
    setModalPlan(null);
    setAdmin(false);
  };

  const toggleSelected = (plan: string) => {
    setSelected((prev) => ({ ...prev, [plan]: !prev[plan] }));
    setSent(false);
  };

  const exportRates = () => {
    if (!data) return;
    const out: Record<string, Record<string, Record<string, unknown>>> = {};
    data.groups.forEach((grp) => {
      (grp.plans || []).forEach((p) => {
        TIERS.forEach((t) => {
          const r = rateFor(overrides, grp, p.plan, t.key);
          if (r.rate == null) return;
          out[grp.name] = out[grp.name] || {};
          out[grp.name][p.plan] = out[grp.name][p.plan] || {};
          out[grp.name][p.plan][t.census] = {
            rate: r.rate,
            source: r.manual ? "manual" : r.derived ? "calculated" : "billed",
          };
        });
      });
    });
    const blob = new Blob(
      [JSON.stringify({ generated: new Date().toISOString(), rates: out }, null, 2)],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "kennion-2026-rates.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  if (loadError) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 20,
          textAlign: "center",
        }}
      >
        <div style={{ ...panel, padding: "26px 30px", maxWidth: 460 }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: C.ink }}>
            We couldn't load your renewal data
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: C.body }}>
            Please refresh the page. If it keeps happening, call Hunter Shepherd at 205-641-0469 or
            email <a href="mailto:hunter@kennion.com">hunter@kennion.com</a>.
          </p>
        </div>
      </div>
    );
  }

  // No session yet: there is nothing to load until a code is entered, because
  // the census is only handed out per-group in exchange for one.
  if (!data || (!admin && !g)) {
    return (
      <Login
        mode={mode}
        codeInput={codeInput}
        email={email}
        staffCode={staffCode}
        codeError={codeError}
        staffError={staffError}
        busy={busy}
        onCode={(v) => {
          setCodeInput(v);
          setCodeError(false);
        }}
        onEmail={(v) => {
          setEmail(v);
          setStaffError(false);
        }}
        onStaffCode={(v) => {
          setStaffCode(v);
          setStaffError(false);
        }}
        onSubmit={submit}
        onStaffSubmit={staffSubmit}
        onMode={(m) => {
          setMode(m);
          setCodeError(false);
          setStaffError(false);
        }}
      />
    );
  }

  if (admin) {
    return (
      <Admin
        data={data}
        overrides={overrides}
        query={adminQuery}
        tpa={adminTpa}
        gapsOnly={gapsOnly}
        onQuery={setAdminQuery}
        onTpa={setAdminTpa}
        onToggleGaps={() => setGapsOnly((v) => !v)}
        onSetOverride={setOverride}
        onExport={exportRates}
        onExit={signOut}
      />
    );
  }

  // Narrowing for TypeScript: a non-admin session always has a group, because
  // the guard above returns the sign-in screen otherwise.
  if (!g) return null;

  const tabBase = {
    background: "none",
    border: "none",
    borderBottom: "3px solid transparent",
    padding: "0 15px",
    fontSize: 13.5,
    color: C.body,
    cursor: "pointer",
  };
  const tabOn = {
    ...tabBase,
    borderBottom: `3px solid ${C.orange}`,
    fontWeight: 600,
    color: C.ink,
  };

  const subline =
    tab === "2027"
      ? "Effective 01/01/2027"
      : `Dates ${fmtDate(g.pyStart)} - ${fmtDate(g.pyEnd)}`;

  const printLine =
    (tab === "current"
      ? `Current group health plans and cost, plan year ${fmtDate(g.pyStart)} – ${fmtDate(g.pyEnd)}`
      : "2027 renewal options, effective January 1, 2027") +
    ` · data as of 7/31/2026 · printed ${new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    })}`;

  return (
    <div>
      <div
        className="noprint"
        style={{ background: "#fff", borderBottom: `1px solid ${C.border}`, padding: "0 22px" }}
      >
        <div
          style={{
            maxWidth: 1400,
            margin: "0 auto",
            height: 48,
            display: "flex",
            alignItems: "stretch",
            justifyContent: "space-between",
            gap: 24,
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <img
              src={Logo}
              alt="Kennion Benefit Advisors"
              style={{ height: 28, display: "block" }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "stretch", gap: 2 }}>
            <button onClick={() => setTab("current")} style={tab === "current" ? tabOn : tabBase}>
              Current Medical Plan(s)
            </button>
            <button onClick={() => setTab("2027")} style={tab === "2027" ? tabOn : tabBase}>
              2027 Medical Plan Options
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button
              onClick={signOut}
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
      </div>

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "20px 22px 60px" }}>
        <div
          className="printonly"
          style={{
            marginBottom: 14,
            paddingBottom: 8,
            borderBottom: "1px solid #cfd6da",
            fontSize: 11,
            color: C.muted,
          }}
        >
          Kennion Benefit Advisors &middot; {g.name} &middot; {printLine}
        </div>

        <div
          className="panel"
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
          <div style={{ maxWidth: 820 }}>
            <h1
              style={{
                margin: 0,
                fontSize: 23,
                fontWeight: 600,
                color: C.ink,
                letterSpacing: "-0.2px",
              }}
            >
              {g.name}
            </h1>
            <div style={{ marginTop: 8, fontSize: 13, color: C.muted, lineHeight: 1.65 }}>
              {subline}
            </div>
          </div>
          <div className="noprint" style={{ display: "flex", gap: 8 }}>
            <button onClick={() => window.print()} style={smallPrimaryBtn}>
              Print
            </button>
          </div>
        </div>

        {tab === "current" ? (
          <Current
            data={data}
            overrides={overrides}
            g={g}
            rows={rows}
            totals={totals}
            eePct={EE_PCT}
            depPct={DEP_PCT}
            onOpenPlan={setModalPlan}
          />
        ) : (
          <Options
            data={data}
            g={g}
            rows={rows}
            totals={totals}
            sort={sort}
            dir={dir}
            gridQuery={gridQuery}
            carriers={carriers}
            selected={selected}
            note={note}
            sent={sent}
            onSort={(k) => {
              setDir((d) => (sort === k ? -d : 1));
              setSort(k);
            }}
            onGridQuery={setGridQuery}
            onToggleCarrier={(c) => setCarriers((prev) => ({ ...prev, [c]: !prev[c] }))}
            onToggleSelected={toggleSelected}
            onNote={(v) => {
              setNote(v);
              setSent(false);
            }}
            onSend={() => setSent(true)}
          />
        )}

        <div
          className="noprint"
          style={{
            marginTop: 26,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 9,
          }}
        >
          <span style={{ fontSize: 11, color: C.ghost }}>powered by</span>
          <img
            src={Logo}
            alt="Kennion Benefit Advisors"
            style={{ height: 24, display: "block" }}
          />
        </div>
      </div>

      <Footer />

      {modalPlan && (
        <BreakdownModal
          data={data}
          overrides={overrides}
          g={g}
          row={rows.find((r) => r.p.plan === modalPlan)}
          plan={modalPlan}
          freq={freq}
          eePct={EE_PCT}
          depPct={DEP_PCT}
          onFreq={setFreq}
          onClose={() => {
            setModalPlan(null);
            setFreq("M");
          }}
          onPrint={() => window.print()}
        />
      )}
    </div>
  );
}
