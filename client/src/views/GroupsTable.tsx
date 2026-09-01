import { useState } from "react";
import { C, panel } from "@/lib/importui";

export interface AdminGroup {
  name: string;
  code: string;
  sizeCategory: "2-50" | "51+";
  sizeIsSet?: boolean;
  codeIsSet?: boolean;
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
}

interface Props {
  groups: AdminGroup[];
  token: string;
  onChanged: (groups: AdminGroup[]) => void;
}

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
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  async function save(group: string, field: "companyId" | "sizeCategory", value: string) {
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
  const rows = groups.filter(
    (g) =>
      (size === "All" || g.sizeCategory === size) &&
      (!q ||
        `${g.name} ${g.code} ${g.city ?? ""} ${g.state ?? ""} ${g.zip ?? ""} ${g.sic ?? ""} ${g.taxId ?? ""} ${(g.contacts ?? []).map((c) => `${c.name} ${c.email}`).join(" ")}`
          .toLowerCase()
          .includes(q)),
  );

  const counts = {
    small: groups.filter((g) => g.sizeCategory === "2-50").length,
    large: groups.filter((g) => g.sizeCategory === "51+").length,
  };

  return (
    <div style={{ ...panel, marginTop: 16, padding: "20px 22px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: C.ink }}>Groups</h2>
        <span style={{ fontSize: 12.5, color: C.faint }}>
          {groups.length} groups · {counts.small} at 2-50 · {counts.large} at 51+ (ALE)
        </span>
      </div>
      <div style={{ marginTop: 8, fontSize: 13, color: C.muted, lineHeight: 1.65, maxWidth: 880 }}>
        Every group and the code it signs in with. Codes are generated from the company name —
        four letters plus the plan year — and can be typed over. Size defaults from enrolled
        headcount; set it explicitly where the ALE determination differs.
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
        <span style={{ fontSize: 12.5, color: C.faint }}>{rows.length} shown</span>
      </div>

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
              <th style={th}>Company</th>
              <th style={{ ...th, width: 132 }}>Company ID</th>
              <th style={th}>Address</th>
              <th style={th}>City</th>
              <th style={{ ...th, width: 56 }}>State</th>
              <th style={{ ...th, width: 78 }}>ZIP</th>
              <th style={{ ...th, width: 74 }}>SIC</th>
              <th style={{ ...th, width: 104 }}>EIN</th>
              <th style={th}>Contact</th>
              <th style={{ ...th, textAlign: "right", width: 84 }}>Enrolled</th>
              <th style={{ ...th, width: 150 }}>Size</th>
              <th style={{ ...th, width: 128 }}>Data from</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => {
              const key = g.name + "|companyId";
              const val = editing[key] ?? g.code;
              return (
                <tr key={g.name}>
                  <td style={{ ...td, lineHeight: 1.4 }}>
                    {g.name}
                    {g.sicDesc && (
                      <div style={{ fontSize: 11.5, color: C.ghost }}>{g.sicDesc}</div>
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
