import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProposalNav } from "@/components/proposal/proposal-nav";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
// The 2 admin platforms exposed in the bulk UI. The rate engine
// supports more (Virtual_RBP variants), but those are not offered
// here.
const ADMIN_OPTIONS = [
  { value: "EBPA", label: "EBPA" },
  { value: "HEALTHEZ", label: "HealthEZ" },
] as const;

type StagedFile = {
  // local id so React can key on the row even if filename collides.
  uid: string;
  file: File;
  // Editable display name; blank means "use server-derived name (file
  // basename, or Group Name column if present)". Sent to the server
  // via the override-aware multipart payload below.
  groupNameOverride: string;
};

type BulkResult =
  | {
      ok: true;
      fileName: string;
      groupId: string;
      groupName: string;
      proposalId: string;
      totalLives: number;
      ratingArea: string;
    }
  | {
      ok: false;
      fileName: string;
      groupName: string;
      error: string;
    };

type BulkResponse = {
  summary: { total: number; succeeded: number; failed: number; effectiveDate: string; admin: string };
  results: BulkResult[];
};

// First of next month, sensible default for renewals.
function defaultEffectiveDate(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return next.toISOString().slice(0, 10);
}

function basenameNoExt(name: string): string {
  return name.replace(/^.*[\\/]/, "").replace(/\.csv$/i, "");
}

function genUid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export default function AdminQuotesBulkPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [effectiveDate, setEffectiveDate] = useState<string>(defaultEffectiveDate());
  const [administrator, setAdministrator] = useState<string>("EBPA");
  const [running, setRunning] = useState(false);
  const [response, setResponse] = useState<BulkResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const totalSize = useMemo(
    () => staged.reduce((acc, s) => acc + s.file.size, 0),
    [staged],
  );

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list).filter((f) => /\.csv$/i.test(f.name));
    if (incoming.length === 0) {
      toast({
        title: "Only .csv files are accepted",
        variant: "destructive",
      });
      return;
    }
    setStaged((cur) => [
      ...cur,
      ...incoming.map((f) => ({
        uid: genUid(),
        file: f,
        groupNameOverride: "",
      })),
    ]);
  }

  function removeAt(uid: string) {
    setStaged((cur) => cur.filter((s) => s.uid !== uid));
  }
  function clearAll() {
    setStaged([]);
    setResponse(null);
  }

  async function runBulk() {
    if (staged.length === 0 || running) return;
    setRunning(true);
    setResponse(null);
    try {
      const fd = new FormData();
      fd.append("effectiveDate", effectiveDate);
      fd.append("admin", administrator);
      // Per-file optional overrides, each entry is { groupName? } in
      // the same order as the appended files. Server reads body with
      // multer; the override array is JSON-encoded in a single field
      // so we don't depend on multipart field-array ordering.
      const overrides = staged.map((s) => ({
        groupName: s.groupNameOverride.trim() || undefined,
      }));
      fd.append("groupOverrides", JSON.stringify(overrides));
      for (const s of staged) {
        // Re-wrap each file with a normalised filename so the server's
        // basename-derived group name is predictable. The browser
        // preserves the original name on uploads.
        fd.append("files", s.file, s.file.name);
      }

      const res = await fetch("/api/admin/quotes/bulk-upload", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = `${res.status}: Bulk upload failed`;
        try {
          const j = JSON.parse(text);
          msg = j.message || msg;
        } catch {
          /* ignore, leave generic */
        }
        throw new Error(msg);
      }
      const json = (await res.json()) as BulkResponse;
      setResponse(json);
      // Refresh the quotes list now that new groups exist.
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quotes"] });
      toast({
        title: "Bulk run complete",
        description: `${json.summary.succeeded} of ${json.summary.total} succeeded.`,
      });
    } catch (err: any) {
      toast({
        title: "Bulk upload failed",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (running) return;
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  }

  return (
    <div className="min-h-screen bg-background">
      <ProposalNav />
      <div className="mx-auto max-w-[1100px] px-6 py-8">
        <button
          type="button"
          onClick={() => navigate("/admin/quotes")}
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover-elevate rounded-md px-1.5 py-0.5"
          data-testid="button-back-to-quotes"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to quotes
        </button>

        <div className="mb-6">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            <Upload className="h-3.5 w-3.5" />
            Bulk census upload
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            Generate many proposals at once
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            Drop a folder full of census CSVs (one per group). We'll auto-detect
            columns, score, price, and generate a proposal for each, using one
            shared effective date and admin platform. Group name comes from the
            filename, or from a <code className="rounded bg-muted px-1 py-0.5 text-[11px]">Group&nbsp;Name</code>{" "}
            column inside the CSV if you include one.
          </p>
        </div>

        {/* (a) Files */}
        <Card className="mb-6 p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Files</div>
              <div className="text-xs text-muted-foreground">
                {staged.length === 0
                  ? "No files staged yet."
                  : `${staged.length} file${staged.length === 1 ? "" : "s"} · ${(totalSize / 1024).toFixed(1)} KB total`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={running}
                data-testid="button-add-files"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Add files
              </Button>
              {staged.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAll}
                  disabled={running}
                  data-testid="button-clear-files"
                >
                  Clear all
                </Button>
              )}
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
            data-testid="input-bulk-files"
          />
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={cn(
              "rounded-lg border-2 border-dashed border-border/60 p-8 text-center transition-colors",
              dragOver && "border-primary bg-primary/5",
              running && "opacity-60",
            )}
          >
            <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
            <div className="mt-2 text-sm font-medium">
              Drop CSV files here, or click "Add files" above.
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              5 MB per file · up to 200 files per batch.
            </div>
          </div>

          {staged.length > 0 && (
            <div className="mt-5 overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%]">File</TableHead>
                    <TableHead>Group name</TableHead>
                    <TableHead className="text-right">Size</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staged.map((s) => (
                    <TableRow key={s.uid}>
                      <TableCell className="font-mono text-xs">
                        <FileText className="mr-1.5 inline h-3.5 w-3.5 text-muted-foreground" />
                        {s.file.name}
                      </TableCell>
                      <TableCell>
                        <Input
                          value={s.groupNameOverride}
                          onChange={(e) =>
                            setStaged((cur) =>
                              cur.map((x) =>
                                x.uid === s.uid
                                  ? { ...x, groupNameOverride: e.target.value }
                                  : x,
                              ),
                            )
                          }
                          placeholder={basenameNoExt(s.file.name) || "Untitled Group"}
                          className="h-8 text-sm"
                          disabled={running}
                          data-testid={`input-group-name-${s.uid}`}
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                        {(s.file.size / 1024).toFixed(1)} KB
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeAt(s.uid)}
                          disabled={running}
                          data-testid={`button-remove-${s.uid}`}
                          className="h-7 w-7"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>

        {/* (b) Settings */}
        <Card className="mb-6 p-6">
          <div className="mb-4 text-sm font-semibold">Proposal settings</div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="effectiveDate">Effective date</Label>
              <Input
                id="effectiveDate"
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                disabled={running}
                data-testid="input-effective-date"
              />
              <div className="text-xs text-muted-foreground">
                Applied to every group in this batch.
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminPlatform">Admin platform</Label>
              <Select
                value={administrator}
                onValueChange={setAdministrator}
                disabled={running}
              >
                <SelectTrigger id="adminPlatform" data-testid="input-admin">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADMIN_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground">
                Rating area is auto-inferred per group from the census ZIPs.
              </div>
            </div>
          </div>
        </Card>

        {/* (c) Run */}
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            Each file becomes one group + one proposal. Same scrub + AI cleaning
            + scoring + rate engine as the single-file flow.
          </div>
          <Button
            onClick={runBulk}
            disabled={staged.length === 0 || running}
            size="lg"
            className="gap-2"
            data-testid="button-run-bulk"
          >
            {running ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Generate {staged.length || ""} proposal{staged.length === 1 ? "" : "s"}
              </>
            )}
          </Button>
        </div>

        {/* Results */}
        {response && (
          <Card className="overflow-hidden">
            <div className="border-b bg-muted/30 px-5 py-3 text-sm">
              <span className="font-semibold">{response.summary.succeeded}</span>{" "}
              of <span className="font-semibold">{response.summary.total}</span>{" "}
              proposals generated · effective {response.summary.effectiveDate} ·{" "}
              {response.summary.admin}
              {response.summary.failed > 0 && (
                <span className="ml-2 text-destructive">
                  · {response.summary.failed} failed
                </span>
              )}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead className="text-right">Lives</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {response.results.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{r.fileName}</TableCell>
                    <TableCell className="text-sm">{r.groupName}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {r.ok ? r.totalLives : "-"}
                    </TableCell>
                    <TableCell>
                      {r.ok ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Generated · {r.ratingArea}
                        </span>
                      ) : (
                        <span className="inline-flex items-start gap-1.5 text-xs text-destructive">
                          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span className="break-words">{r.error}</span>
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.ok && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/admin/groups/${r.groupId}`)}
                          className="gap-1.5"
                        >
                          Open
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}
