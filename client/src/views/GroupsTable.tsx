import { useState } from "react";
import { C, panel } from "@/lib/importui";
import Link from "@/lib/Link";
import { groupPath } from "@/lib/router";

export interface AdminGroup {
  name: string;
  code: string;
  sizeCategory: "2-50" | "51+";
  sizeIsSet?: boolean;
  codeIsSet?: boolean;
  /** Who brokers the group. Only the label is kept, never a broker's name. */
  broker?: "kennion" | "outside";
  brokerIsSet?: boolean;
  address1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  sic: string | null;
  sicDesc: string | null;
  taxId?: string | null;
  phone?: string | null;
  contacts?: { name: string | null; email: string | null; phone: string | null }[];
  enrolled: number;
  lives: number;
  imported?: boolean;
  importedAt?: string | null;
  archived?: boolean;
  eligible?: boolean;
  programs?: string[];
  carriersSeen?: string[];
  enName?: string | null;
  duplicateOf?: string[];
  tpa?: string;
  plans?: { plan: string; tpa: string; enrolled: number; monthly: number }[];
}

interface Props {
  groups: AdminGroup[];
  token: string;
  onChanged: (groups: AdminGroup[]) => void;
}

type SortKey =
  | "name" | "code" | "address1" | "city" | "state" | "zip" | "sic"
  | "taxId" | "contact" | "enrolled" | "sizeCategory" | "broker" | "importedAt";

export const BROKER_LABEL = { kennion: "Kennion", outside: "Outside Broker" } as const;
type Broker = keyof typeof BROKER_LABEL;

const th = {
  textAlign: "left" as const,
  padding: "11px 10px",
  fontWeight: 600,
  color: C.ink,
  borderBottom: `1px solid ${C.border}`,
  whiteSpace: "nowrap" as const,
};
const td = { padding: "8px 10px", borderBottom: `1px solid ${C.hairline}`, color: C.ink };

export default function GroupsTable({ groups, token, onChanged }: Props) {
  const [query, setQuery] = useState("");
  const [size, setSize] = useState<"All" | "2-50" | "51+">("All");
  const [broker, setBroker] = useState<"All" | Broker>("All");
  const [showArchived, setShowArchived] = useState(false);
  const [view, setView] = useState<"live" | "excluded">("live");
  const [sort, setSort] = useState<SortKey>("name");
  const [dir, setDir] = useState(1);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  async function save(group: string, field: "companyId" | "sizeCategory" | "broker", value: string) {
    setError("");
    const r = await fetch("/api/admin/group-meta", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ group, field, value }),
    });
    const j = await r.json().catch(() => ({ error: `Server returned ${r.status}.` }));
    if (!r.ok) {
      setError(j.error || "Could not save.");
      return false;
    }
    onChanged(j.groups);
    setSaved(group + "|" + field);
    setTimeout(() => setSaved(""), 1500);
    return true;
  }

  const q = query.trim().toLowerCase();
  const filtered = groups.filter(
    (g) =>
      (showArchived ? !!g.archived : !g.archived) &&
      (view === "excluded" ? g.eligible === false : g.eligible !== false) &&
      (size === "All" || g.sizeCategory === size) &&
      (broker === "All" || (g.broker || "kennion") === broker) &&
      (!q ||
        `${g.name} ${g.code} ${g.city ?? ""} ${g.state ?? ""} ${g.zip ?? ""} ${g.sic ?? ""} ${g.taxId ?? ""} ${BROKER_LABEL[g.broker || "kennion"]} ${(g.contacts ?? []).map((c) => `${c.name} ${c.email}`).join(" ")}`
          .toLowerCase()
          .includes(q)),
  );

  const sortVal = (g: AdminGroup): string | number => {
    if (sort === "enrolled") return g.enrolled ?? 0;
    if (sort === "importedAt") return g.importedAt ? Date.parse(g.importedAt) : 0;
    if (sort === "contact") return (g.contacts?.[0]?.name || "").toLowerCase();
    if (sort === "broker") return BROKER_LABEL[g.broker || "kennion"].toLowerCase();
    const v = (g as unknown as Record<string, unknown>)[sort];
    return String(v ?? "").toLowerCase();
  };
  const rows = [...filtered].sort((a, b) => {
    const va = sortVal(a);
    const vb = sortVal(b);
    if (va === vb) return a.name.localeCompare(b.name);
    // Blanks sort last regardless of direction, so an empty column does not
    // bury the rows that actually have values.
    if (va === "" ) return 1;
    if (vb === "") return -1;
    return (va > vb ? 1 : -1) * dir;
  });

  const sortBy = (k: SortKey) => {
    setDir((d) => (sort === k ? -d : 1));
    setSort(k);
  };
  const H = ({ k, label, align, width }: { k: SortKey; label: string; align?: "right"; width?: number }) => (
    <th
      onClick={() => sortBy(k)}
      style={{
        ...th,
        width,
        textAlign: align || "left",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      {label}
      <span style={{ color: sort === k ? C.blue : "transparent" }}>{dir > 0 ? " ▲" : " ▼"}</span>
    </th>
  );

  const live = groups.filter((g) => !g.archived && g.eligible !== false);
  const counts = {
    small: live.filter((g) => g.sizeCategory === "2-50").length,
    large: live.filter((g) => g.sizeCategory === "51+").length,
    archived: groups.length - live.length,
    excluded: groups.filter((g) => !g.archived && g.eligible === false).length,
    outside: live.filter((g) => g.broker === "outside").length,
    dupes: groups.filter((g) => !g.archived && (g.duplicateOf || []).length).length,
  };

  return (
    <div style={{ ...panel, marginTop: 16, padding: "20px 22px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: C.ink }}>Groups</h2>
        <span style={{ fontSize: 12.5, color: C.faint }}>
          {live.length} groups · {counts.small} at 2-50 · {counts.large} at 51+ (ALE) ·{" "}
          {counts.outside} with an outside broker
          {counts.archived > 0 && ` · ${counts.archived} archived`}
        </span>
      </div>
      <div style={{ marginTop: 8, fontSize: 13, color: C.muted, lineHeight: 1.65, maxWidth: 880 }}>
        {view === "excluded" ? (
          <>
            These groups have no enrolled medical plan with EBPA, HealthEZ or BCBS of Alabama, so
            they are not in the 2027 portal and their access codes are refused. The carriers found
            on each are listed — if one of those <em>is</em> a program carrier under a name the
            rule does not recognise, say so and it will be matched.
          </>
        ) : (
          <>
            Every group and the code it signs in with. Codes are generated from the company name —
            four letters plus the plan year — and can be typed over. Size defaults from enrolled
            headcount; set it explicitly where the ALE determination differs. Broker says whether
            Kennion places the group directly or an outside broker does. Click a company to open
            its page.
          </>
        )}
      </div>

      <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search company, code, city, ZIP or SIC"
          aria-label="Search groups"
          style={{
            flex: 1,
            minWidth: 260,
            padding: "8px 11px",
            fontSize: 13.5,
            color: C.ink,
            border: `1px solid ${C.inputEdge}`,
            borderRadius: 4,
            outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: 2 }}>
          {(["All", "2-50", "51+"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSize(s)}
              style={{
                padding: "7px 13px",
                fontSize: 13,
                borderRadius: 4,
                cursor: "pointer",
                ...(size === s
                  ? { color: "#fff", background: C.blue, border: `1px solid ${C.blue}`, fontWeight: 500 }
                  : { color: C.body, background: "#fff", border: `1px solid ${C.inputEdge}` }),
              }}
            >
              {s}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 2 }} role="group" aria-label="Filter by broker">
          {(["All", "kennion", "outside"] as const).map((b) => (
            <button
              key={b}
              onClick={() => setBroker(b)}
              aria-pressed={broker === b}
              style={{
                padding: "7px 13px",
                fontSize: 13,
                borderRadius: 4,
                cursor: "pointer",
                ...(broker === b
                  ? { color: "#fff", background: C.blue, border: `1px solid ${C.blue}`, fontWeight: 500 }
                  : { color: C.body, background: "#fff", border: `1px solid ${C.inputEdge}` }),
              }}
            >
              {b === "All" ? "All brokers" : BROKER_LABEL[b]}
            </button>
          ))}
        </div>
        {counts.excluded > 0 && (
          <button
            onClick={() => setView((v) => (v === "live" ? "excluded" : "live"))}
            style={{
              padding: "7px 13px",
              fontSize: 13,
              borderRadius: 4,
              cursor: "pointer",
              ...(view === "excluded"
                ? { color: "#fff", background: C.red, border: `1px solid ${C.red}`, fontWeight: 500 }
                : { color: C.body, background: "#fff", border: `1px solid ${C.inputEdge}` }),
            }}
          >
            {view === "excluded" ? "Viewing not in program" : `Not in program (${counts.excluded})`}
          </button>
        )}
        {counts.archived > 0 && (
          <button
            onClick={() => setShowArchived((v) => !v)}
            style={{
              padding: "7px 13px",
              fontSize: 13,
              borderRadius: 4,
              cursor: "pointer",
              ...(showArchived
                ? { color: "#fff", background: C.amber, border: `1px solid ${C.amber}`, fontWeight: 500 }
                : { color: C.body, background: "#fff", border: `1px solid ${C.inputEdge}` }),
            }}
          >
            {showArchived ? "Viewing archived" : `Archived (${counts.archived})`}
          </button>
        )}
        <span style={{ fontSize: 12.5, color: C.faint }}>{rows.length} shown</span>
      </div>

      {counts.dupes > 0 && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            background: C.amberTint,
            border: `1px solid ${C.amberEdge}`,
            borderRadius: 4,
            fontSize: 12.5,
            color: C.amber,
            lineHeight: 1.55,
          }}
        >
          <strong>{counts.dupes} rows look like the same client under two names.</strong> These
          were created before imports matched on a normalised name. Open each pair, decide which
          holds the current data, and archive the other — nothing is deleted. Flagged with
          <span style={{ color: C.red }}> ⚠ duplicate</span> below.
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            marginTop: 12,
            padding: "9px 12px",
            background: C.redTint,
            border: `1px solid ${C.redEdge}`,
            borderRadius: 4,
            fontSize: 13,
            color: C.red,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ marginTop: 14, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 1040 }}>
          <thead>
            <tr>
              <H k="name" label="Company" />
              <H k="code" label="Company ID" width={132} />
              <H k="address1" label="Address" />
              <H k="city" label="City" />
              <H k="state" label="State" width={62} />
              <H k="zip" label="ZIP" width={84} />
              <H k="sic" label="SIC" width={80} />
              <H k="taxId" label="EIN" width={110} />
              <H k="contact" label="Contact" />
              <H k="enrolled" label="Enrolled" align="right" width={92} />
              <H k="sizeCategory" label="Size" width={150} />
              <H k="broker" label="Broker" width={190} />
              <H k="importedAt" label="Data from" width={132} />
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => {
              const key = g.name + "|companyId";
              const val = editing[key] ?? g.code;
              return (
                <tr key={g.name}>
                  <td style={{ ...td, lineHeight: 1.4 }}>
                    <Link href={groupPath(g.name)} style={{ color: C.blue }}>
                      {g.name}
                    </Link>
                    {!!g.duplicateOf?.length && (
                      <div style={{ fontSize: 11.5, color: C.red, marginTop: 2 }}>
                        ⚠ duplicate of {g.duplicateOf.join(", ")}
                      </div>
                    )}
                    {g.enName && (
                      <div style={{ fontSize: 11.5, color: C.ghost, marginTop: 2 }}>
                        Employee Navigator: {g.enName}
                      </div>
                    )}
                    {view === "excluded" ? (
                      <div style={{ fontSize: 11.5, color: C.red, marginTop: 2 }}>
                        carriers found: {(g.carriersSeen || []).join(", ") || "none"}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11.5, color: C.ghost }}>
                        {(g.programs || []).join(" · ")}
                        {g.sicDesc ? `${g.programs?.length ? " · " : ""}${g.sicDesc}` : ""}
                      </div>
                    )}
                  </td>
                  <td style={{ ...td, padding: "5px 8px" }}>
                    <input
                      value={val}
                      onChange={(e) => setEditing((p) => ({ ...p, [key]: e.target.value.toUpperCase() }))}
                      onBlur={async () => {
                        if (val === g.code) return;
                        const ok = await save(g.name, "companyId", val);
                        setEditing((p) => {
                          const n = { ...p };
                          delete n[key];
                          return n;
                        });
                        if (!ok) return;
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                      aria-label={`Company ID for ${g.name}`}
                      style={{
                        width: "100%",
                        padding: "6px 8px",
                        fontSize: 12.5,
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        color: g.codeIsSet ? C.blue : C.ink,
                        fontWeight: 600,
                        border: `1px solid ${saved === key ? C.greenEdge : C.border}`,
                        background: saved === key ? C.greenTint : "#fff",
                        borderRadius: 3,
                        outline: "none",
                      }}
                    />
                  </td>
                  <td style={{ ...td, color: g.address1 ? C.ink : C.ghost }}>{g.address1 || "—"}</td>
                  <td style={{ ...td, color: g.city ? C.ink : C.ghost }}>{g.city || "—"}</td>
                  <td style={{ ...td, color: g.state ? C.ink : C.ghost }}>{g.state || "—"}</td>
                  <td style={{ ...td, color: g.zip ? C.ink : C.ghost, fontVariantNumeric: "tabular-nums" }}>
                    {g.zip || "—"}
                  </td>
                  <td style={{ ...td, color: g.sic ? C.ink : C.ghost, fontVariantNumeric: "tabular-nums" }}>
                    {g.sic || "—"}
                  </td>
                  <td
                    style={{
                      ...td,
                      color: g.taxId ? C.ink : C.ghost,
                      fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {g.taxId || "—"}
                  </td>
                  <td style={{ ...td, lineHeight: 1.4 }}>
                    {g.contacts && g.contacts.length ? (
                      <>
                        {g.contacts[0].name}
                        {g.contacts[0].email && (
                          <div style={{ fontSize: 11.5 }}>
                            <a href={`mailto:${g.contacts[0].email}`}>{g.contacts[0].email}</a>
                          </div>
                        )}
                        {g.contacts.length > 1 && (
                          <div style={{ fontSize: 11, color: C.ghost }}>
                            +{g.contacts.length - 1} more
                          </div>
                        )}
                      </>
                    ) : (
                      <span style={{ color: C.ghost }}>—</span>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {g.enrolled}
                  </td>
                  <td style={{ ...td, padding: "5px 8px" }}>
                    <div style={{ display: "flex", gap: 2 }}>
                      {(["2-50", "51+"] as const).map((s) => {
                        const on = g.sizeCategory === s;
                        return (
                          <button
                            key={s}
                            onClick={() => void save(g.name, "sizeCategory", s)}
                            style={{
                              flex: 1,
                              padding: "5px 8px",
                              fontSize: 12,
                              borderRadius: 3,
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                              ...(on
                                ? {
                                    color: "#fff",
                                    background: C.blue,
                                    border: `1px solid ${C.blue}`,
                                    fontWeight: 500,
                                  }
                                : { color: C.body, background: "#fff", border: `1px solid ${C.border}` }),
                            }}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                    {!g.sizeIsSet && (
                      <div style={{ fontSize: 10.5, color: C.ghost, marginTop: 2 }}>from headcount</div>
                    )}
                  </td>
                  <td style={{ ...td, padding: "5px 8px" }}>
                    <div style={{ display: "flex", gap: 2 }} role="group" aria-label={`Broker for ${g.name}`}>
                      {(["kennion", "outside"] as const).map((b) => {
                        const on = (g.broker || "kennion") === b;
                        return (
                          <button
                            key={b}
                            onClick={() => void save(g.name, "broker", b)}
                            aria-pressed={on}
                            style={{
                              flex: 1,
                              padding: "5px 8px",
                              fontSize: 12,
                              borderRadius: 3,
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                              ...(on
                                ? b === "outside"
                                  ? {
                                      color: "#fff",
                                      background: C.amber,
                                      border: `1px solid ${C.amber}`,
                                      fontWeight: 500,
                                    }
                                  : {
                                      color: "#fff",
                                      background: C.blue,
                                      border: `1px solid ${C.blue}`,
                                      fontWeight: 500,
                                    }
                                : { color: C.body, background: "#fff", border: `1px solid ${C.border}` }),
                            }}
                          >
                            {BROKER_LABEL[b]}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    {g.importedAt ? (
                      <>
                        <span style={{ color: C.green, fontSize: 12.5 }}>XML import</span>
                        <div style={{ fontSize: 11.5, color: C.ghost }}>
                          {new Date(g.importedAt).toLocaleDateString()}
                        </div>
                      </>
                    ) : (
                      <>
                        <span style={{ color: C.faint, fontSize: 12.5 }}>Census</span>
                        <div style={{ fontSize: 11.5, color: C.ghost }}>7/31/2026</div>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
