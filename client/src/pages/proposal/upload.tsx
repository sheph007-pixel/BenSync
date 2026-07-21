import { useCallback, useRef, useState } from "react";
import { Upload as UploadIcon, Sparkles, Loader2, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProposalNav } from "@/components/proposal/proposal-nav";
import { ProposalFooter } from "@/components/proposal/proposal-footer";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { Group } from "@shared/schema";

type Props = {
  onComplete: (group: Group) => void;
  // When set, this flow REPLACES the existing group's census instead
  // of creating a new one. Same upload + AI-clean UX either way, only
  // the terminal confirm step differs. Null/omitted = create new group.
  replaceForGroupId?: string;
  // When true, the wizard is running on the admin-side internal-sales
  // quote flow. Posts to /api/admin/quotes/* (session-stash based, no
  // DB row until confirm validates). The prospect details have already
  // been stashed by step 1 of the wizard.
  adminQuoteFlow?: boolean;
  // Optional page chrome overrides for the admin wizard.
  title?: string;
  subtitle?: React.ReactNode;
  nav?: React.ReactNode;
};

// Detail surfaced from the failing endpoint so the rep / customer can
// actually see what went wrong rather than the old generic
// "couldn't read that file" dialog.
type UploadFailure = {
  message: string;
  guidance?: string;
  errors?: string[];
  matchRate?: number;
};

// Pull the JSON error body from a failed Response when present and
// turn it into an UploadFailure. Falls back to a generic message if
// the response isn't JSON.
async function readFailure(res: Response, fallback: string): Promise<UploadFailure> {
  try {
    const body = await res.json();
    return {
      message: body?.message || fallback,
      guidance: typeof body?.guidance === "string" ? body.guidance : undefined,
      errors: Array.isArray(body?.errors) ? body.errors.slice(0, 6) : undefined,
      matchRate: typeof body?.matchRate === "number" ? body.matchRate : undefined,
    };
  } catch {
    return { message: fallback };
  }
}

const REQUIRED_FIELDS = [
  "First Name",
  "Last Name",
  "Relationship (EE / SP / CH)",
  "Date of Birth",
  "Gender",
  "Zip Code",
];

export function ProposalUpload({
  onComplete,
  replaceForGroupId,
  adminQuoteFlow,
  title,
  subtitle,
  nav,
}: Props) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [failure, setFailure] = useState<UploadFailure | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        toast({
          title: "Please upload a CSV",
          description: "The file needs a .csv extension.",
          variant: "destructive",
        });
        return;
      }
      setUploading(true);
      try {
        // Three modes share the same upload UX but post to different
        // endpoint families. The server-side AI-clean + scoring logic
        // is symmetric across all three.
        const endpoints = adminQuoteFlow
          ? {
              parse: "/api/admin/quotes/parse",
              applyMapping: "/api/admin/quotes/apply-mapping",
              confirm: "/api/admin/quotes/confirm",
            }
          : {
              parse: "/api/groups/parse",
              applyMapping: "/api/groups/apply-mapping",
              confirm: replaceForGroupId
                ? `/api/groups/${replaceForGroupId}/census/replace-from-pending`
                : "/api/groups/confirm",
            };

        const form = new FormData();
        form.append("file", file);
        const parseRes = await fetch(endpoints.parse, {
          method: "POST",
          body: form,
          credentials: "include",
        });
        if (!parseRes.ok) {
          if (parseRes.status === 423) throw new Error("locked");
          setFailure(await readFailure(parseRes, "We couldn't read that CSV."));
          return;
        }
        const parsed = await parseRes.json();

        const mappingRes = await fetch(endpoints.applyMapping, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ columnMapping: parsed.columnMapping ?? {} }),
          credentials: "include",
        });
        if (!mappingRes.ok) {
          setFailure(await readFailure(mappingRes, "We couldn't process the column mapping."));
          return;
        }

        // Confirm step. Fetch directly so we can inspect the JSON
        // body, apiRequest throws on !ok and loses the structured
        // validation guidance / errors array.
        const confirmRes = await fetch(endpoints.confirm, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
          credentials: "include",
        });
        if (!confirmRes.ok) {
          if (confirmRes.status === 423) throw new Error("locked");
          setFailure(await readFailure(confirmRes, "Something went wrong saving the census."));
          return;
        }
        const data = await confirmRes.json();

        // Refresh every cache that renders this group's data so the
        // cockpit picks up the new stats, risk tier, and rates.
        await queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
        if (adminQuoteFlow) {
          queryClient.invalidateQueries({ queryKey: ["/api/admin/quotes"] });
        }
        if (replaceForGroupId) {
          queryClient.invalidateQueries({
            queryKey: ["/api/groups", replaceForGroupId, "census"],
          });
          queryClient.invalidateQueries({
            queryKey: ["/api/rate/price-group", replaceForGroupId],
          });
          queryClient.invalidateQueries({ queryKey: ["/api/admin/groups"] });
          queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
        }
        onComplete(data.group);
      } catch (err: any) {
        const msg = err?.message || "";
        if (/locked/i.test(msg)) {
          toast({
            title: "Proposal is locked",
            description: "Contact your BenSync advisor to reopen it.",
            variant: "destructive",
          });
        } else {
          // Network failure / unexpected error, the per-step branches
          // above catch HTTP errors with structured bodies; this is the
          // last-resort dialog when none of those fired.
          setFailure({ message: msg || "Something went wrong uploading that CSV." });
        }
      } finally {
        setUploading(false);
      }
    },
    [onComplete, replaceForGroupId, adminQuoteFlow, toast],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const headingTitle =
    title ?? (replaceForGroupId ? "Replace Your Census" : "Upload Your Employee Census");
  const headingSubtitle =
    subtitle ??
    (replaceForGroupId ? (
      <>
        Upload a new CSV to replace the current roster. We'll re-run
        underwriting and reprice your plans on the new census -
        company, contacts, and rating area stay the same.
      </>
    ) : (
      <>
        You will need each <strong className="text-foreground">employee</strong> and all{" "}
        <strong className="text-foreground">family members</strong> (i.e. spouses and children)
        that will be covered under the group health plan.
      </>
    ));

  return (
    <div className="min-h-screen bg-background">
      {nav ?? <ProposalNav />}
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-primary">
            {headingTitle}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {headingSubtitle}
          </p>
        </div>

        <Card
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center border-2 border-dashed px-6 py-16 text-center transition",
            dragActive ? "border-primary bg-primary/5" : "border-border/80 hover:border-primary/40",
            uploading && "pointer-events-none opacity-60",
          )}
          data-testid="dropzone-census"
        >
          {uploading ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="mt-3 font-semibold">Uploading…</div>
              <div className="text-sm text-muted-foreground">Parsing your CSV</div>
            </>
          ) : (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <UploadIcon className="h-6 w-6 text-primary" />
              </div>
              <div className="mt-4 text-base font-semibold text-foreground">
                Drag & drop your CSV file here
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                or click anywhere to browse · CSV up to 10MB
              </div>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            data-testid="input-census-file"
          />
        </Card>

        <Card className="mt-4 border-primary/25 bg-primary/[0.04] p-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-6 w-7 shrink-0 items-center justify-center rounded-[4px] bg-primary text-[10px] font-bold tracking-wide text-primary-foreground">
              AI
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-foreground">
                Just include these 6 fields (any column names work):
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {REQUIRED_FIELDS.map((f) => (
                  <span
                    key={f}
                    className="rounded-md border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground"
                  >
                    {f}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                AI detects columns and cleans data automatically
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Don't have a list?{" "}
                <a
                  href="/api/groups/template"
                  className="font-semibold text-primary underline underline-offset-2"
                  data-testid="link-download-template"
                >
                  Download example CSV
                </a>
              </div>
            </div>
          </div>
        </Card>

      </div>
      <ProposalFooter />

      <Dialog open={Boolean(failure)} onOpenChange={(open) => !open && setFailure(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Couldn't process that CSV
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="font-medium text-foreground" data-testid="text-upload-error-message">
              {failure?.message}
            </p>
            {failure?.matchRate != null && (
              <p className="text-xs text-muted-foreground">
                Match rate {failure.matchRate}%, the AI cleaner couldn't reconcile
                enough rows back to the original file.
              </p>
            )}
            {failure?.guidance && (
              <div className="rounded-md border border-primary/20 bg-primary/[0.04] p-3">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
                  <Sparkles className="h-3 w-3" />
                  How to fix
                </div>
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
                  {failure.guidance}
                </p>
              </div>
            )}
            {failure?.errors && failure.errors.length > 0 && (
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Specific issues
                </div>
                <ul className="ml-4 list-disc space-y-0.5 text-xs text-muted-foreground">
                  {failure.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Need a hand?{" "}
              <a href="mailto:support@bensync.com" className="font-semibold text-primary">
                support@bensync.com
              </a>{" "}
             , send the file and we'll get it loaded.
            </p>
          </div>
          <div className="flex justify-end pt-2">
            <Button onClick={() => setFailure(null)}>OK, I'll try again</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
