import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { C, money0, panel } from "@/lib/importui";
import { pill } from "@/lib/ui";
import Link from "@/lib/Link";
import { PATHS, groupPath } from "@/lib/router";
import type { AdminGroup } from "@/views/GroupsTable";

/** One uploaded carrier proposal, as the server lists it (no file bytes). */
export interface Proposal {
  id: number;
  group_name: string | null;
  carrier: string | null;
  filename: string;
  mime: string;
  size: number;
  extracted: Extraction | null;
  summary: string | null;
  confidence: number | null;
  status: "analyzing" | "assigned" | "suggested" | "unassigned";
  assigned_by: string | null;
  error: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  updated_at: string;
}

interface Extraction {
  carrier?: string;
  group_name_on_document?: string | null;
  matched_group?: string | null;
  confidence?: number;
  effective_date?: string | null;
  proposal_type?: string;
  enrolled_on_document?: number | null;
  plans?: {
    name: string;
    plan_type?: string | null;
    deductible?: string | null;
    oop_max?: string | null;
    rates?: { EE?: number | null; ES?: number | null; EC?: number | null; FAM?: number | null };
    monthly_total?: number | null;
  }[];
  total_monthly?: number | null;
  summary?: string;
  audit_flags?: string[];
}

const ACCEPT = ".pdf,.csv,.txt,application/pdf,text/csv,text/plain";

const fmtSize = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);
const fmtWhen = (s: string) =>
  new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const money = (v: number | null | undefined) => (v == null ? "—" : `$${v.toFixed(2)}`);

/** The status pill: who assigned it, or what is still needed. */
function StatusPill({ p }: { p: Proposal }) {
  if (p.status === "analyzing") return <span style={pill(C.blue, C.blueTint, C.blueEdge)}>Reading…</span>;
  if (p.error && !p.group_name) return <span style={pill(C.red, C.redTint, C.redEdge)}>Could not read</span>;
  if (p.status === "unassigned") return <span style={pill(C.amber, C.amberTint, C.amberEdge)}>Needs assignment</span>;
  if (p.status === "suggested") return <span style={pill(C.amber, C.amberTint, C.amberEdge)}>AI suggests — confirm</span>;
  if (p.assigned_by === "ai") return <span style={pill(C.green, C.greenTint, C.greenEdge)}>Assigned by AI</span>;
  return <span style={pill(C.green, C.greenTint, C.greenEdge)}>Assigned</span>;
}

/** Upload files one at a time; the server stores each and reads it after. */
async function uploadFiles(
  files: File[],
  token: string,
  group: string | null,
  onEach: (name: string, ok: boolean, msg?: string) => void,
) {
  for (const f of files) {
    const mime = f.type || (f.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "text/plain");
    const q = new URLSearchParams({ filename: f.name });
    if (group) q.set("group", group);
    try {
      const r = await fetch(`/api/admin/proposals?${q}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": mime },
        body: f,
      });
      const j = await r.json().catch(() => ({ error: `Server returned ${r.status}.` }));
      onEach(f.name, r.ok, r.ok ? undefined : j.error);
    } catch (e) {
      onEach(f.name, false, (e as Error).message);
    }
  }
}

const dropZone = (active: boolean): CSSProperties => ({
  border: `2px dashed ${active ? C.blue : C.inputEdge}`,
  background: active ? C.blueTint : "#fff",
  borderRadius: 6,
  padding: "22px 20px",
  textAlign: "center",
  cursor: "pointer",
  transition: "background .1s",
});

const selectStyle: CSSProperties = {
  padding: "6px 9px",
  fontSize: 12.5,
  color: C.ink,
  border: `1px solid ${C.inputEdge}`,
  borderRadius: 4,
  background: "#fff",
  maxWidth: 260,
};

const linkBtn: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  fontSize: 12.5,
  color: C.blue,
  cursor: "pointer",
};

/** Open the stored file in a new tab, sending the staff token with the request. */
async function openFile(id: number, token: string) {
  const r = await fetch(`/api/admin/proposals/${id}/file`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return;
  const url = URL.createObjectURL(await r.blob());
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function useProposals(token: string, group?: string) {
  const [items, setItems] = useState<Proposal[]>([]);
  const [ai, setAi] = useState<boolean | null>(null);
  const [durable, setDurable] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const q = group ? `?group=${encodeURIComponent(group)}` : "";
    const r = await fetch(`/api/admin/proposals${q}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) {
      setError("Could not load proposals — sign in again.");
      return;
    }
    const j = await r.json();
    setItems(j.proposals || []);
    setAi(!!j.ai);
    setDurable(!!j.durable);
    setError("");
  }, [token, group]);

  useEffect(() => {
    void load();
  }, [load]);

  // While anything is being read, ask again every few seconds.
  const busy = items.some((p) => p.status === "analyzing");
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [busy, load]);

  return { items, ai, durable, error, load, setError };
}

/** Plans and rates Claude read off the document, as a small table. */
function Extracted({ x }: { x: Extraction }) {
  const plans = x.plans || [];
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 12.5, color: C.body, lineHeight: 1.6 }}>
        {x.group_name_on_document && (
          <>
            On the document: <strong style={{ color: C.ink }}>{x.group_name_on_document}</strong>
          </>
        )}
        {x.effective_date && ` · effective ${x.effective_date}`}
        {x.proposal_type && x.proposal_type !== "unknown" && ` · ${x.proposal_type}`}
        {x.enrolled_on_document != null && ` · priced on ${x.enrolled_on_document} enrolled`}
        {x.total_monthly != null && ` · ${money0(x.total_monthly)} / mo total`}
      </div>
      {plans.length > 0 && (
        <div style={{ overflowX: "auto", marginTop: 6 }}>
          <table style={{ borderCollapse: "collapse", fontSize: 12.5, minWidth: 520 }}>
            <thead>
              <tr>
                {["Plan", "Deductible", "OOP max", "EE", "EE+SP", "EE+CH", "Family", "Monthly"].map((h, i) => (
                  <th
                    key={h}
                    style={{
                      textAlign: i >= 3 ? "right" : "left",
                      padding: "5px 8px 5px 0",
                      fontWeight: 600,
                      color: C.muted,
                      borderBottom: `1px solid ${C.border}`,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plans.map((p, i) => (
                <tr key={i}>
                  <td style={{ padding: "5px 8px 5px 0", color: C.ink, borderBottom: `1px solid ${C.hairline}` }}>
                    {p.name}
                    {p.plan_type && <span style={{ color: C.ghost }}> · {p.plan_type}</span>}
                  </td>
                  <td style={{ padding: "5px 8px 5px 0", color: C.body, borderBottom: `1px solid ${C.hairline}` }}>{p.deductible || "—"}</td>
                  <td style={{ padding: "5px 8px 5px 0", color: C.body, borderBottom: `1px solid ${C.hairline}` }}>{p.oop_max || "—"}</td>
                  {(["EE", "ES", "EC", "FAM"] as const).map((t) => (
                    <td
                      key={t}
                      style={{ padding: "5px 8px 5px 0", textAlign: "right", color: C.ink, borderBottom: `1px solid ${C.hairline}`, fontVariantNumeric: "tabular-nums" }}
                    >
                      {money(p.rates?.[t])}
                    </td>
                  ))}
                  <td style={{ padding: "5px 0", textAlign: "right", color: C.ink, fontWeight: 600, borderBottom: `1px solid ${C.hairline}`, fontVariantNumeric: "tabular-nums" }}>
                    {p.monthly_total == null ? "—" : money0(p.monthly_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!!x.audit_flags?.length && (
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12.5, color: C.amber, lineHeight: 1.6 }}>
          {x.audit_flags.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface RowProps {
  p: Proposal;
  token: string;
  groups: AdminGroup[];
  onChanged: () => void;
  /** When set, the row is on that company's page: no group column. */
  fixedGroup?: string;
}

function ProposalRow({ p, token, groups, onChanged, fixedGroup }: RowProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const post = async (path: string, body?: unknown, method = "POST") => {
    setBusy(true);
    try {
      const r = await fetch(path, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (r.ok) onChanged();
    } finally {
      setBusy(false);
    }
  };

  const x = p.extracted;
  const conf = p.confidence != null ? `${Math.round(p.confidence * 100)}%` : null;

  return (
    <div style={{ padding: "12px 0", borderBottom: `1px solid ${C.hairline}`, opacity: busy ? 0.6 : 1 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 14px" }}>
        <StatusPill p={p} />
        <button onClick={() => void openFile(p.id, token)} style={{ ...linkBtn, fontSize: 13.5, fontWeight: 500 }} title="Open the file">
          {p.filename}
        </button>
        <span style={{ fontSize: 12, color: C.ghost }}>
          {p.carrier || "Carrier unknown"} · {fmtSize(p.size)} · {fmtWhen(p.uploaded_at)}
          {p.uploaded_by ? ` · ${p.uploaded_by}` : ""}
        </span>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          {!fixedGroup && (
            <select
              value={p.group_name || ""}
              onChange={(e) => void post(`/api/admin/proposals/${p.id}`, { group: e.target.value || null })}
              aria-label={`Group for ${p.filename}`}
              disabled={p.status === "analyzing"}
              style={{
                ...selectStyle,
                borderColor: p.status === "suggested" ? C.amberEdge : p.group_name ? C.inputEdge : C.amber,
                background: p.status === "suggested" ? C.amberTint : "#fff",
              }}
            >
              <option value="">— assign to a group —</option>
              {groups.map((g) => (
                <option key={g.name} value={g.name}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
          {p.status === "suggested" && (
            <button onClick={() => void post(`/api/admin/proposals/${p.id}`, { confirm: true })} style={{ ...linkBtn, fontWeight: 600 }}>
              Confirm{conf ? ` (${conf})` : ""}
            </button>
          )}
          {x && (
            <button onClick={() => setOpen((v) => !v)} style={linkBtn}>
              {open ? "Hide details" : "Details"}
            </button>
          )}
          <button onClick={() => void post(`/api/admin/proposals/${p.id}/analyze`)} style={linkBtn} disabled={p.status === "analyzing"}>
            Re-read
          </button>
          {confirmDelete ? (
            <>
              <button onClick={() => void post(`/api/admin/proposals/${p.id}`, undefined, "DELETE")} style={{ ...linkBtn, color: C.red, fontWeight: 600 }}>
                Delete for good
              </button>
              <button onClick={() => setConfirmDelete(false)} style={linkBtn}>
                Keep
              </button>
            </>
          ) : (
            <button onClick={() => setConfirmDelete(true)} style={{ ...linkBtn, color: C.faint }}>
              Delete
            </button>
          )}
        </span>
      </div>
      {!fixedGroup && p.group_name && p.status !== "analyzing" && (
        <div style={{ marginTop: 6, fontSize: 12.5, color: C.body }}>
          <Link href={groupPath(p.group_name)}>{p.group_name}</Link>
          {p.assigned_by === "ai" && conf && <span style={{ color: C.ghost }}> · matched by AI at {conf}</span>}
          {p.assigned_by && p.assigned_by !== "ai" && p.assigned_by !== "filename" && (
            <span style={{ color: C.ghost }}> · assigned by {p.assigned_by}</span>
          )}
          {p.assigned_by === "filename" && <span style={{ color: C.ghost }}> · guessed from the filename</span>}
        </div>
      )}
      {p.summary && p.status !== "analyzing" && (
        <div style={{ marginTop: 6, fontSize: 12.5, color: C.muted, lineHeight: 1.55, maxWidth: 900 }}>{p.summary}</div>
      )}
      {p.error && (
        <div style={{ marginTop: 6, fontSize: 12.5, color: C.red }}>{p.error}</div>
      )}
      {!open && !!x?.audit_flags?.length && p.status !== "analyzing" && (
        <div style={{ marginTop: 4, fontSize: 12.5, color: C.amber }}>
          ⚠ {x.audit_flags.length === 1 ? x.audit_flags[0] : `${x.audit_flags.length} things to check`}
        </div>
      )}
      {open && x && <Extracted x={x} />}
    </div>
  );
}

/** Drop zone plus hidden multi-file input. */
function Uploader({
  token,
  group,
  onDone,
  compact,
}: {
  token: string;
  group: string | null;
  onDone: () => void;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [log, setLog] = useState<{ name: string; ok: boolean; msg?: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const send = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    setLog([]);
    await uploadFiles(files, token, group, (name, ok, msg) => setLog((l) => [...l, { name, ok, msg }]));
    setBusy(false);
    onDone();
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void send(Array.from(e.dataTransfer.files));
        }}
        style={{ ...dropZone(drag), padding: compact ? "14px 16px" : "22px 20px" }}
      >
        <div style={{ fontSize: compact ? 13 : 14, fontWeight: 500, color: C.ink }}>
          {busy ? "Uploading…" : group ? `Drop proposals for ${group} here, or click to choose` : "Drop carrier proposals here, or click to choose"}
        </div>
        <div style={{ marginTop: 4, fontSize: 12.5, color: C.faint }}>
          PDF or CSV · several at once is fine · each is read and {group ? "filed under this group" : "matched to its group"}
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          onChange={(e) => void send(Array.from(e.target.files || []))}
          aria-label={group ? `Upload proposals for ${group}` : "Upload proposals"}
          style={{ display: "none" }}
        />
      </div>
      {log.length > 0 && (
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6 }}>
          {log.map((l, i) => (
            <li key={i} style={{ color: l.ok ? C.green : C.red }}>
              {l.name}: {l.ok ? "uploaded" : l.msg || "failed"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface Props {
  token: string;
  /** Live roster: what a proposal can be assigned to. */
  groups: AdminGroup[];
}

/** The Proposals tab: upload in bulk, review what the AI matched, assign the rest. */
export default function Proposals({ token, groups }: Props) {
  const { items, ai, durable, error, load } = useProposals(token);
  const [view, setView] = useState<"all" | "queue" | "assigned">("all");
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const rows = items.filter(
    (p) =>
      (view === "all" ||
        (view === "queue" ? p.status !== "assigned" : p.status === "assigned")) &&
      (!q || `${p.filename} ${p.carrier || ""} ${p.group_name || ""} ${p.summary || ""}`.toLowerCase().includes(q)),
  );
  const counts = {
    queue: items.filter((p) => p.status === "unassigned" || p.status === "suggested").length,
    reading: items.filter((p) => p.status === "analyzing").length,
    assigned: items.filter((p) => p.status === "assigned").length,
  };

  const sortedGroups = [...groups].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <div style={{ ...panel, padding: "20px 22px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 23, fontWeight: 600, color: C.ink, letterSpacing: "-0.2px" }}>
            Proposals
          </h1>
          <span style={{ fontSize: 12.5, color: C.faint }}>
            {items.length} on file · {counts.assigned} assigned · {counts.queue} to assign
            {counts.reading ? ` · ${counts.reading} being read` : ""}
          </span>
        </div>
        <div style={{ marginTop: 8, fontSize: 13, color: C.muted, lineHeight: 1.65, maxWidth: 880 }}>
          Upload proposals as they come in from UnitedHealthcare, Gravie, Nationwide or anyone else —
          a whole batch at once. Each file is read: the carrier, the group named on it, the plans and
          tier rates. A clear match is assigned to its group; a doubtful one is suggested for you to
          confirm; the rest wait here for you to assign. Every proposal can also be opened from its
          company&rsquo;s page, where you can upload straight to that group.
        </div>
        {ai === false && (
          <div
            style={{
              marginTop: 12,
              padding: "9px 12px",
              background: C.amberTint,
              border: `1px solid ${C.amberEdge}`,
              borderRadius: 4,
              fontSize: 12.5,
              color: C.amber,
              lineHeight: 1.55,
            }}
          >
            <strong>AI reading is off.</strong> Set <code>ANTHROPIC_API_KEY</code> (or <code>CLAUDE</code>)
            in Railway and redeploy, and files will be read and matched automatically. Until then, uploads are stored and you assign each
            group by hand; a filename that names a group is used as a hint.
          </div>
        )}
        {!durable && (
          <div
            style={{
              marginTop: 12,
              padding: "9px 12px",
              background: C.amberTint,
              border: `1px solid ${C.amberEdge}`,
              borderRadius: 4,
              fontSize: 12.5,
              color: C.amber,
              lineHeight: 1.55,
            }}
          >
            <strong>No database is connected</strong>, so proposals are held in memory and will be lost
            on the next deploy. Set <code>DATABASE_URL</code> to keep them.
          </div>
        )}
        <div style={{ marginTop: 16 }}>
          <Uploader token={token} group={null} onDone={load} />
        </div>
      </div>

      <div style={{ ...panel, marginTop: 16, padding: "14px 22px 6px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, paddingBottom: 10, borderBottom: `1px solid ${C.border}` }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search file, carrier or group"
            aria-label="Search proposals"
            style={{ flex: "1 1 240px", minWidth: 200, padding: "8px 11px", fontSize: 13.5, color: C.ink, border: `1px solid ${C.inputEdge}`, borderRadius: 4, outline: "none" }}
          />
          <div style={{ display: "flex", gap: 2 }} role="group" aria-label="Which proposals">
            {(
              [
                ["all", `All (${items.length})`],
                ["queue", `To assign (${counts.queue + counts.reading})`],
                ["assigned", `Assigned (${counts.assigned})`],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setView(k)}
                aria-pressed={view === k}
                style={{
                  padding: "7px 13px",
                  fontSize: 13,
                  borderRadius: 4,
                  cursor: "pointer",
                  ...(view === k
                    ? { color: "#fff", background: C.blue, border: `1px solid ${C.blue}`, fontWeight: 500 }
                    : { color: C.body, background: "#fff", border: `1px solid ${C.inputEdge}` }),
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {error && (
          <div role="alert" style={{ margin: "12px 0", fontSize: 13, color: C.red }}>
            {error}
          </div>
        )}
        {!rows.length ? (
          <div style={{ padding: "26px 0", textAlign: "center", fontSize: 13, color: C.faint }}>
            {items.length ? "Nothing matches." : "No proposals yet. Drop the first batch above."}
          </div>
        ) : (
          rows.map((p) => <ProposalRow key={p.id} p={p} token={token} groups={sortedGroups} onChanged={() => void load()} />)
        )}
      </div>
    </>
  );
}

/** The proposals panel on a company page: what is filed here, and a way to add more. */
export function GroupProposals({ group, token }: { group: string; token: string }) {
  const { items, error, load } = useProposals(token, group);
  return (
    <div style={{ ...panel, marginTop: 16, padding: "18px 22px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.ink }}>Proposals</h3>
        <span style={{ fontSize: 12.5, color: C.faint }}>
          {items.length ? `${items.length} on file` : "none yet"} ·{" "}
          <Link href={PATHS.proposals}>all proposals</Link>
        </span>
      </div>
      {error && (
        <div role="alert" style={{ marginTop: 10, fontSize: 13, color: C.red }}>
          {error}
        </div>
      )}
      {items.map((p) => (
        <ProposalRow key={p.id} p={p} token={token} groups={[]} onChanged={() => void load()} fixedGroup={group} />
      ))}
      <div style={{ marginTop: 12 }}>
        <Uploader token={token} group={group} onDone={load} compact />
      </div>
    </div>
  );
}
