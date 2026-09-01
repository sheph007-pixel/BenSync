import { useRef, useState } from "react";
import { C, money0, panel } from "@/lib/importui";

interface Company {
  name: string;
  enIdentifier: string | null;
  tpa: string;
  pyStart: string | null;
  pyEnd: string | null;
  enrolled: number;
  lives: number;
  monthly: number;
  plans: { plan: string; enrolled: number }[];
  hasSplit: boolean;
  stats: { employeesInFile: number; ratesFound: number; splitsFound: number };
  isNew: boolean;
  current: { enrolled: number; lives: number; monthly: number; plans: number } | null;
}

interface Preview {
  companies: Company[];
  failures: { name: string; reason: string }[];
  totalEnrolled: number;
}

interface Props {
  token: string;
  durable: boolean;
  onImported: (groups: unknown[]) => void;
}

export default function ImportPanel({ token, durable, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [done, setDone] = useState("");

  const reset = () => {
    setFile(null);
    setFileName("");
    setPreview(null);
    setChosen({});
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  };

  /** Upload the file itself; it is streamed, never read into a JS string. */
  async function send(url: string) {
    if (!file) throw new Error("no file");
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/xml" },
      body: file,
    });
    const j = await r.json().catch(() => ({ error: `Server returned ${r.status}.` }));
    if (!r.ok) throw new Error(j.error || `Server returned ${r.status}.`);
    return j;
  }

  async function pick(f: File) {
    reset();
    setDone("");
    setFile(f);
    setFileName(`${f.name} · ${(f.size / 1048576).toFixed(1)} MB`);
    setBusy("Reading the export…");
    try {
      const r = await fetch("/api/admin/import/preview", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/xml" },
        body: f,
      });
      const j = await r.json().catch(() => ({ error: `Server returned ${r.status}.` }));
      if (!r.ok) {
        setError(j.error || `Server returned ${r.status}.`);
        return;
      }
      setPreview(j);
      setChosen(Object.fromEntries(j.companies.map((c: Company) => [c.name, true])));
    } catch {
      setError("The upload did not complete. Check your connection and try again.");
    } finally {
      setBusy("");
    }
  }

  async function apply() {
    if (!preview) return;
    const names = preview.companies.map((c) => c.name).filter((n) => chosen[n]);
    if (!names.length) {
      setError("Nothing selected.");
      return;
    }
    setBusy(`Importing ${names.length} group${names.length > 1 ? "s" : ""}…`);
    setError("");
    try {
      const j = await send(`/api/admin/import?only=${encodeURIComponent(names.join("\n"))}`);
      onImported(j.groups);
      const n = j.applied.length;
      setDone(
        `Imported ${n} group${n > 1 ? "s" : ""} — ` +
          j.applied
            .slice(0, 3)
            .map((a: { name: string; enrolled: number }) => `${a.name} (${a.enrolled})`)
            .join(", ") +
          (n > 3 ? `, and ${n - 3} more.` : "."),
      );
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy("");
    }
  }

  const banner = (bg: string, edge: string, fg: string, body: React.ReactNode) => (
    <div
      style={{
        marginTop: 12,
        padding: "9px 12px",
        background: bg,
        border: `1px solid ${edge}`,
        borderRadius: 4,
        fontSize: 12.5,
        color: fg,
        lineHeight: 1.55,
      }}
    >
      {body}
    </div>
  );

  const chosenCount = preview ? preview.companies.filter((c) => chosen[c.name]).length : 0;

  return (
    <div style={{ ...panel, marginTop: 16, padding: "20px 22px" }}>
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: C.ink }}>
        Import from Employee Navigator
      </h2>
      <div style={{ marginTop: 8, fontSize: 13, color: C.muted, lineHeight: 1.65, maxWidth: 880 }}>
        Upload an Employee Navigator XML export — a single group, or a full Data API export with
        every company in it. It reads active medical enrollments only, and pulls the billed rate and
        the actual employer/employee split for every tier someone is enrolled in. Nothing is saved
        until you confirm.
      </div>

      {!durable &&
        banner(
          C.amberTint,
          C.amberEdge,
          C.amber,
          <>
            Imports are held on the server's disk, which Railway replaces on every deploy — so they
            will be lost at the next one. Mount a Railway volume and set <code>DATA_DIR</code> to it
            to make them permanent.
          </>,
        )}

      <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <input
          ref={fileRef}
          type="file"
          accept=".xml,text/xml,application/xml"
          disabled={!!busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pick(f);
          }}
          style={{ fontSize: 13 }}
        />
        {fileName && <span style={{ fontSize: 12.5, color: C.faint }}>{fileName}</span>}
        {busy && <span style={{ fontSize: 12.5, color: C.blue }}>{busy}</span>}
      </div>

      {error && banner(C.redTint, C.redEdge, C.red, error)}
      {done && banner(C.greenTint, C.greenEdge, C.green, done)}

      {preview && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.rule}` }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 12,
              marginBottom: 10,
            }}
          >
            <strong style={{ fontSize: 15, color: C.ink }}>
              {preview.companies.length} compan{preview.companies.length === 1 ? "y" : "ies"} in this
              export
            </strong>
            <span style={{ fontSize: 12.5, color: C.faint }}>
              {preview.totalEnrolled} enrolled in total
            </span>
            {preview.companies.length > 1 && (
              <span style={{ display: "flex", gap: 10, marginLeft: "auto" }}>
                <button
                  onClick={() =>
                    setChosen(Object.fromEntries(preview.companies.map((c) => [c.name, true])))
                  }
                  style={{ background: "none", border: "none", fontSize: 12.5, color: C.blue, cursor: "pointer" }}
                >
                  Select all
                </button>
                <button
                  onClick={() => setChosen({})}
                  style={{ background: "none", border: "none", fontSize: 12.5, color: C.blue, cursor: "pointer" }}
                >
                  Select none
                </button>
              </span>
            )}
          </div>

          <div style={{ maxHeight: 420, overflowY: "auto", border: `1px solid ${C.hairline}`, borderRadius: 4 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.zebra }}>
                  {["", "Company", "EN identifier", "Enrolled", "Monthly", "Splits", ""].map((h, i) => (
                    <th
                      key={i}
                      style={{
                        textAlign: i >= 3 && i <= 4 ? "right" : "left",
                        padding: "9px 10px",
                        fontWeight: 600,
                        color: C.ink,
                        borderBottom: `1px solid ${C.border}`,
                        position: "sticky",
                        top: 0,
                        background: C.zebra,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.companies.map((c) => (
                  <tr key={c.name}>
                    <td style={{ padding: "8px 10px", borderBottom: `1px solid ${C.hairline}` }}>
                      <input
                        type="checkbox"
                        checked={!!chosen[c.name]}
                        onChange={() => setChosen((p) => ({ ...p, [c.name]: !p[c.name] }))}
                        aria-label={`Import ${c.name}`}
                        style={{ accentColor: C.blue, width: 15, height: 15 }}
                      />
                    </td>
                    <td style={{ padding: "8px 10px", borderBottom: `1px solid ${C.hairline}`, color: C.ink }}>
                      {c.name}
                      <div style={{ fontSize: 11.5, color: C.ghost }}>
                        {c.tpa || "—"} · {c.plans.map((p) => `${p.plan} (${p.enrolled})`).join(" · ")}
                      </div>
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        borderBottom: `1px solid ${C.hairline}`,
                        color: C.body,
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        fontSize: 12,
                        maxWidth: 190,
                        overflowWrap: "anywhere",
                      }}
                    >
                      {c.enIdentifier || "—"}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        borderBottom: `1px solid ${C.hairline}`,
                        textAlign: "right",
                        color: C.ink,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {c.enrolled}
                      {c.current && c.current.enrolled !== c.enrolled && (
                        <div style={{ fontSize: 11.5, color: C.amber }}>was {c.current.enrolled}</div>
                      )}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        borderBottom: `1px solid ${C.hairline}`,
                        textAlign: "right",
                        color: C.ink,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {money0(c.monthly)}
                      {c.current && Math.abs(c.current.monthly - c.monthly) >= 1 && (
                        <div style={{ fontSize: 11.5, color: C.amber }}>
                          was {money0(c.current.monthly)}
                        </div>
                      )}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        borderBottom: `1px solid ${C.hairline}`,
                        color: c.hasSplit ? C.green : C.faint,
                        fontSize: 12.5,
                      }}
                    >
                      {c.hasSplit ? `${c.stats.splitsFound} actual` : "none"}
                    </td>
                    <td style={{ padding: "8px 10px", borderBottom: `1px solid ${C.hairline}` }}>
                      <span
                        style={{
                          fontSize: 11.5,
                          fontWeight: 500,
                          whiteSpace: "nowrap",
                          color: c.isNew ? C.green : C.amber,
                          background: c.isNew ? C.greenTint : C.amberTint,
                          border: `1px solid ${c.isNew ? C.greenEdge : C.amberEdge}`,
                          borderRadius: 3,
                          padding: "3px 8px",
                        }}
                      >
                        {c.isNew ? "New" : "Replaces"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.failures.length > 0 &&
            banner(
              C.amberTint,
              C.amberEdge,
              C.amber,
              <>
                {preview.failures.length} company record(s) skipped:{" "}
                {preview.failures.slice(0, 3).map((f) => `${f.name} — ${f.reason}`).join("; ")}
              </>,
            )}

          <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
            <button
              onClick={() => void apply()}
              disabled={!!busy || !chosenCount}
              style={{
                padding: "8px 16px",
                fontSize: 13.5,
                fontWeight: 500,
                color: "#fff",
                background: C.blue,
                border: `1px solid ${C.blue}`,
                borderRadius: 4,
                cursor: chosenCount ? "pointer" : "default",
                opacity: busy || !chosenCount ? 0.6 : 1,
              }}
            >
              Import {chosenCount} selected
            </button>
            <button
              onClick={reset}
              disabled={!!busy}
              style={{ background: "none", border: "none", fontSize: 13, color: C.blue, cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
