import { useRef, useState } from "react";
import { C, money0, panel } from "@/lib/importui";

interface Preview {
  group: {
    name: string;
    tpa: string;
    pyStart: string | null;
    pyEnd: string | null;
    enrolled: number;
    lives: number;
    monthly: number;
    plans: { plan: string; tpa: string; enrolled: number; monthly: number }[];
  };
  stats: { employeesInFile: number; ratesFound: number; splitsFound: number };
  hasSplit: boolean;
  current: { enrolled: number; lives: number; monthly: number; plans: number } | null;
  isNew: boolean;
}

interface Props {
  token: string;
  durable: boolean;
  onImported: (groups: unknown[]) => void;
}

export default function ImportPanel({ token, durable, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [xml, setXml] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  const reset = () => {
    setXml(null);
    setFileName("");
    setPreview(null);
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  };

  async function pick(file: File) {
    reset();
    setDone("");
    setFileName(`${file.name} · ${(file.size / 1048576).toFixed(1)} MB`);
    setBusy(true);
    try {
      const body = await file.text();
      setXml(body);
      const r = await fetch("/api/admin/import/preview", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/xml" },
        body,
      });
      const j = await r.json();
      if (!r.ok) setError(j.error || "Could not read that file.");
      else setPreview(j);
    } catch {
      setError("Could not read that file.");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!xml) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/admin/import", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/xml" },
        body: xml,
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error || "Import failed.");
        return;
      }
      onImported(j.groups);
      setDone(`Imported ${j.name} — ${j.enrolled} enrolled, ${money0(j.monthly)}/mo. Access code ${j.code}.`);
      reset();
    } catch {
      setError("Import failed.");
    } finally {
      setBusy(false);
    }
  }

  const g = preview?.group;
  const cur = preview?.current;
  const delta = (now: number, before: number | undefined) =>
    before == null ? null : now - before;

  const row = (label: string, next: string, before?: string, changed?: boolean) => (
    <div style={{ display: "flex", gap: 12, fontSize: 13, padding: "5px 0", color: C.body }}>
      <span style={{ width: 150 }}>{label}</span>
      <strong style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>{next}</strong>
      {before != null && (
        <span style={{ color: changed ? C.amber : C.faint }}>
          {changed ? `was ${before}` : "unchanged"}
        </span>
      )}
    </div>
  );

  return (
    <div style={{ ...panel, marginTop: 16, padding: "20px 22px" }}>
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: C.ink }}>
        Import from Employee Navigator
      </h2>
      <div
        style={{ marginTop: 8, fontSize: 13, color: C.muted, lineHeight: 1.65, maxWidth: 860 }}
      >
        Upload a group's Employee Navigator XML export. It reads active medical enrollments only,
        and pulls the billed rate and the actual employer/employee split for every tier someone is
        enrolled in. You'll see what changes before anything is saved.
      </div>

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
          Imports are held on the server's disk, which Railway replaces on every deploy — so they
          will be lost at the next one. Mount a Railway volume and set <code>DATA_DIR</code> to it
          to make them permanent.
        </div>
      )}

      <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <input
          ref={fileRef}
          type="file"
          accept=".xml,text/xml,application/xml"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pick(f);
          }}
          style={{ fontSize: 13 }}
        />
        {fileName && <span style={{ fontSize: 12.5, color: C.faint }}>{fileName}</span>}
        {busy && <span style={{ fontSize: 12.5, color: C.muted }}>Reading…</span>}
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

      {done && (
        <div
          style={{
            marginTop: 12,
            padding: "9px 12px",
            background: C.greenTint,
            border: `1px solid ${C.greenEdge}`,
            borderRadius: 4,
            fontSize: 13,
            color: C.green,
          }}
        >
          {done}
        </div>
      )}

      {preview && g && (
        <div
          style={{
            marginTop: 16,
            paddingTop: 14,
            borderTop: `1px solid ${C.rule}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <strong style={{ fontSize: 15, color: C.ink }}>{g.name}</strong>
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 500,
                color: preview.isNew ? C.green : C.amber,
                background: preview.isNew ? C.greenTint : C.amberTint,
                border: `1px solid ${preview.isNew ? C.greenEdge : C.amberEdge}`,
                borderRadius: 3,
                padding: "3px 8px",
              }}
            >
              {preview.isNew ? "New group" : "Replaces existing group"}
            </span>
          </div>

          {row("Enrolled", String(g.enrolled), cur ? String(cur.enrolled) : undefined,
               !!delta(g.enrolled, cur?.enrolled))}
          {row("Covered lives", String(g.lives), cur ? String(cur.lives) : undefined,
               !!delta(g.lives, cur?.lives))}
          {row("Monthly premium", money0(g.monthly), cur ? money0(cur.monthly) : undefined,
               Math.abs(delta(g.monthly, cur?.monthly) ?? 0) >= 1)}
          {row("Plans", String(g.plans.length), cur ? String(cur.plans) : undefined,
               !!delta(g.plans.length, cur?.plans))}
          {row("TPA", g.tpa || "—")}
          {row("Plan year", `${g.pyStart ?? "?"} → ${g.pyEnd ?? "?"}`)}

          <div style={{ marginTop: 10, fontSize: 12.5, color: C.faint, lineHeight: 1.6 }}>
            {preview.stats.employeesInFile} employees in the file ·{" "}
            {preview.stats.ratesFound} billed tier rates ·{" "}
            {preview.hasSplit
              ? `${preview.stats.splitsFound} actual employer/employee splits`
              : "no employer/employee split found"}
            <br />
            {g.plans.map((p) => `${p.plan} (${p.enrolled})`).join(" · ")}
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
            <button
              onClick={() => void apply()}
              disabled={busy}
              style={{
                padding: "8px 16px",
                fontSize: 13.5,
                fontWeight: 500,
                color: "#fff",
                background: C.blue,
                border: `1px solid ${C.blue}`,
                borderRadius: 4,
                cursor: "pointer",
                opacity: busy ? 0.6 : 1,
              }}
            >
              {busy ? "Importing…" : preview.isNew ? "Add this group" : "Replace this group"}
            </button>
            <button
              onClick={reset}
              disabled={busy}
              style={{
                background: "none",
                border: "none",
                fontSize: 13,
                color: C.blue,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
