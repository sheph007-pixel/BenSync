import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText, Pencil, Upload, Plus, Trash2, Info, Check, Download, Lock } from "lucide-react";
import type { CensusEntry } from "@shared/schema";
import { cn } from "@/lib/utils";

type DraftRow = {
  _id: string | number;
  firstName: string;
  lastName: string;
  relationship: string;
  dateOfBirth: string;
  gender: string;
  zipCode: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: CensusEntry[] | undefined;
  censusFileName?: string | null;
  submittedAt?: Date | string | null;
  // When true, Edit and Replace are disabled (admin has frozen the
  // proposal). View + Download still work.
  locked?: boolean;
  onSave?: (rows: Omit<DraftRow, "_id">[]) => Promise<void> | void;
  onReplace?: () => void;
};

const REL_LABEL: Record<string, string> = {
  EE: "Employee",
  Employee: "Employee",
  SP: "Spouse",
  Spouse: "Spouse",
  CH: "Child",
  Child: "Child",
};

function relShort(r: string): "EE" | "SP" | "CH" {
  const v = (r || "").toLowerCase();
  if (v === "ee" || v === "employee") return "EE";
  if (v === "sp" || v === "spouse") return "SP";
  return "CH";
}

function toDraft(entries: CensusEntry[]): DraftRow[] {
  return entries.map((e, idx) => ({
    _id: e.id ?? idx,
    firstName: e.firstName ?? "",
    lastName: e.lastName ?? "",
    relationship: REL_LABEL[e.relationship ?? ""] ?? e.relationship ?? "Employee",
    dateOfBirth: e.dateOfBirth ?? "",
    gender: e.gender ?? "M",
    zipCode: e.zipCode ?? "",
  }));
}

function computePreviewStats(rows: DraftRow[]) {
  let ees = 0, spouses = 0, children = 0;
  for (const r of rows) {
    const s = relShort(r.relationship);
    if (s === "EE") ees++;
    else if (s === "SP") spouses++;
    else children++;
  }
  return { ees, spouses, children, lives: ees + spouses + children };
}

export function CensusModal({
  open,
  onOpenChange,
  entries,
  censusFileName,
  submittedAt,
  locked,
  onSave,
  onReplace,
}: Props) {
  const initial = useMemo(() => toDraft(entries ?? []), [entries]);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [draft, setDraft] = useState<DraftRow[]>(initial);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);

  const enterEdit = () => {
    setDraft(initial.map((r) => ({ ...r })));
    setDirty(false);
    setMode("edit");
  };

  const cancelEdit = () => {
    setDraft(initial);
    setDirty(false);
    setMode("view");
  };

  const updateCell = (id: string | number, field: keyof DraftRow, val: string) => {
    setDraft((d) => d.map((r) => (r._id === id ? { ...r, [field]: val } : r)));
    setDirty(true);
  };

  const removeRow = (id: string | number) => {
    setDraft((d) => d.filter((r) => r._id !== id));
    setDirty(true);
  };

  const addRow = (rel: "Employee" | "Spouse" | "Child") => {
    setDraft((d) => [
      ...d,
      {
        _id: `new-${Date.now()}`,
        relationship: rel,
        firstName: "",
        lastName: "",
        dateOfBirth: "",
        gender: "M",
        zipCode: "",
      },
    ]);
    setDirty(true);
  };

  const handleSave = async () => {
    if (!onSave) return;
    const valid = draft.filter(
      (r) => r.firstName.trim() && r.lastName.trim() && r.dateOfBirth.trim(),
    );
    setSaving(true);
    try {
      const cleaned = valid.map(({ _id: _, ...rest }) => rest);
      await onSave(cleaned);
      setDirty(false);
      setMode("view");
    } finally {
      setSaving(false);
    }
  };

  const rows = mode === "edit" ? draft : initial;
  const preview = mode === "edit" ? computePreviewStats(rows) : computePreviewStats(initial);

  const downloadCsv = () => {
    const header = ["First Name", "Last Name", "Relationship", "Date of Birth", "Gender", "Zip Code"];
    const escape = (s: string) => {
      const v = (s ?? "").toString();
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    };
    const lines = [header.join(",")];
    for (const r of initial) {
      lines.push(
        [r.firstName, r.lastName, relShort(r.relationship), r.dateOfBirth, r.gender, r.zipCode]
          .map(escape)
          .join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = censusFileName || "census.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  const baseStats = computePreviewStats(initial);
  const submitted =
    submittedAt instanceof Date
      ? submittedAt
      : typeof submittedAt === "string"
        ? new Date(submittedAt)
        : null;

  return (
    <Dialog open={open} onOpenChange={(o) => (!o && mode === "edit" && dirty ? null : onOpenChange(o))}>
      <DialogContent className="max-w-4xl" data-testid="modal-census">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Source data
                {mode === "edit" && (
                  <Badge variant="secondary" className="text-[10px]">
                    Editing
                  </Badge>
                )}
              </div>
              <DialogTitle className="mt-1 flex items-center gap-2 text-xl">
                <FileText className="h-5 w-5" />
                {censusFileName ?? "Census"}
              </DialogTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {mode === "edit"
                  ? `Editing · ${preview.ees} employees · ${preview.lives} lives`
                  : submitted
                    ? `Submitted ${submitted.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} · ${preview.ees} employees · ${preview.lives} lives`
                    : `${preview.ees} employees · ${preview.lives} lives`}
              </p>
            </div>
            {mode === "view" && !locked && (
              <div className="flex items-center gap-2 pr-8">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={enterEdit}
                  data-testid="button-census-edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setConfirmReplace(true)}
                  data-testid="button-census-replace"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Replace
                </Button>
              </div>
            )}
            {mode === "view" && locked && (
              <div className="flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/5 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400 pr-8">
                <Lock className="h-3 w-3" />
                Locked by your advisor
              </div>
            )}
          </div>
        </DialogHeader>

        {mode === "edit" && (
          <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground">
            <Info className="h-3.5 w-3.5 text-primary" />
            Changes save instantly to your proposal. Rates recalculate when you click Save.
          </div>
        )}

        <div className="grid grid-cols-4 gap-3">
          <StatChip label="Employees" value={preview.ees} delta={mode === "edit" ? preview.ees - baseStats.ees : 0} />
          <StatChip label="Spouses" value={preview.spouses} delta={mode === "edit" ? preview.spouses - baseStats.spouses : 0} />
          <StatChip label="Children" value={preview.children} delta={mode === "edit" ? preview.children - baseStats.children : 0} />
          <StatChip label="Total Lives" value={preview.lives} delta={mode === "edit" ? preview.lives - baseStats.lives : 0} emphasis />
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {mode === "edit"
              ? `Editing ${rows.length} rows · click any cell to update`
              : `Showing all ${rows.length} rows · these rates are calculated from this roster`}
          </span>
        </div>

        <div className="overflow-auto rounded-md border bg-card" style={{ maxHeight: 420 }}>
          <Table className="table-fixed">
            <colgroup>
              <col style={{ width: "15%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "18%" }} />
              {mode === "edit" && <col style={{ width: "12%" }} />}
            </colgroup>
            <TableHeader className="sticky top-0 bg-muted/60 backdrop-blur">
              <TableRow>
                <TableHead>First</TableHead>
                <TableHead>Last</TableHead>
                <TableHead>Rel</TableHead>
                <TableHead>DOB</TableHead>
                <TableHead>Sex</TableHead>
                <TableHead>Zip</TableHead>
                {mode === "edit" && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) =>
                mode === "edit" ? (
                  <EditRow key={r._id} row={r} onChange={(f, v) => updateCell(r._id, f, v)} onRemove={() => removeRow(r._id)} />
                ) : (
                  <ViewRow key={r._id} row={r} />
                ),
              )}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={mode === "edit" ? 7 : 6} className="py-8 text-center text-muted-foreground">
                    No rows. Add a row below.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {mode === "edit" && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => addRow("Employee")}>
              <Plus className="h-3.5 w-3.5" />
              Add Employee
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => addRow("Spouse")}>
              <Plus className="h-3.5 w-3.5" />
              Add Spouse
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => addRow("Child")}>
              <Plus className="h-3.5 w-3.5" />
              Add Child
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">
              Spouse/Child rows attach to the most recent Employee above.
            </span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          {mode === "view" ? (
            <>
              <Button
                variant="outline"
                onClick={downloadCsv}
                className="gap-1.5"
                data-testid="button-download-census"
                disabled={initial.length === 0}
              >
                <Download className="h-4 w-4" />
                Download CSV
              </Button>
              <Button onClick={() => onOpenChange(false)} data-testid="button-close-census">
                Close
              </Button>
            </>
          ) : (
            <>
              <span className="mr-auto text-xs text-muted-foreground">
                {dirty ? (
                  <span className="font-semibold text-primary">● Unsaved changes</span>
                ) : (
                  "No changes"
                )}
              </span>
              <Button variant="outline" onClick={cancelEdit} disabled={saving} data-testid="button-cancel-edit">
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={!dirty || saving}
                className="gap-1.5"
                data-testid="button-save-census"
              >
                <Check className="h-4 w-4" />
                Save & Recalculate
              </Button>
            </>
          )}
        </div>
      </DialogContent>

      <Dialog open={confirmReplace} onOpenChange={setConfirmReplace}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Replace census?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This uploads a new CSV and re-runs the full analysis. Your current proposal will
            be updated with the new roster.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmReplace(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setConfirmReplace(false);
                onOpenChange(false);
                onReplace?.();
              }}
            >
              Upload new CSV
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

function StatChip({
  label,
  value,
  delta,
  emphasis,
}: {
  label: string;
  value: number;
  delta?: number;
  emphasis?: boolean;
}) {
  return (
    <Card className={cn("p-3", emphasis && "border-primary/40 bg-primary/5")}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="text-xl font-bold tabular-nums">{value}</span>
        {delta != null && delta !== 0 && (
          <span
            className={cn(
              "text-xs font-semibold",
              delta > 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400",
            )}
          >
            {delta > 0 ? "+" : ""}
            {delta}
          </span>
        )}
      </div>
    </Card>
  );
}

function ViewRow({ row }: { row: DraftRow }) {
  const r = relShort(row.relationship);
  const relClass =
    r === "EE"
      ? "bg-primary/10 text-primary"
      : r === "SP"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
        : "bg-purple-500/15 text-purple-700 dark:text-purple-400";
  return (
    <TableRow>
      <TableCell className="py-2">{row.firstName}</TableCell>
      <TableCell className="py-2">{row.lastName}</TableCell>
      <TableCell className="py-2">
        <span className={cn("inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold", relClass)}>
          {r}
        </span>
      </TableCell>
      <TableCell className="py-2 font-mono tabular-nums">{row.dateOfBirth}</TableCell>
      <TableCell className="py-2">{row.gender}</TableCell>
      <TableCell className="py-2 font-mono tabular-nums">{row.zipCode}</TableCell>
    </TableRow>
  );
}

function EditRow({
  row,
  onChange,
  onRemove,
}: {
  row: DraftRow;
  onChange: (field: keyof DraftRow, val: string) => void;
  onRemove: () => void;
}) {
  return (
    <TableRow>
      <TableCell className="py-1.5">
        <Input
          value={row.firstName}
          onChange={(e) => onChange("firstName", e.target.value)}
          placeholder="First"
          className="h-8"
        />
      </TableCell>
      <TableCell className="py-1.5">
        <Input
          value={row.lastName}
          onChange={(e) => onChange("lastName", e.target.value)}
          placeholder="Last"
          className="h-8"
        />
      </TableCell>
      <TableCell className="py-1.5">
        <Select value={relShort(row.relationship)} onValueChange={(v) => onChange("relationship", v === "EE" ? "Employee" : v === "SP" ? "Spouse" : "Child")}>
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="EE">EE</SelectItem>
            <SelectItem value="SP">SP</SelectItem>
            <SelectItem value="CH">CH</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="py-1.5">
        <Input
          value={row.dateOfBirth}
          onChange={(e) => onChange("dateOfBirth", e.target.value)}
          placeholder="M/D/YYYY"
          className="h-8 font-mono"
        />
      </TableCell>
      <TableCell className="py-1.5">
        <Select value={row.gender} onValueChange={(v) => onChange("gender", v)}>
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="M">M</SelectItem>
            <SelectItem value="F">F</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="py-1.5">
        <Input
          value={row.zipCode}
          onChange={(e) => onChange("zipCode", e.target.value)}
          placeholder="ZIP"
          className="h-8 font-mono"
        />
      </TableCell>
      <TableCell className="py-1.5 text-right">
        <Button variant="ghost" size="icon" onClick={onRemove} className="h-7 w-7 text-muted-foreground hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
