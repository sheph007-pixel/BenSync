import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BadgeCheck, Download, Loader2 } from "lucide-react";
import { TIER_CONFIG, type RiskTier } from "@/pages/admin/constants";
import { useScoreReview, type AgeBandRow } from "@/hooks/use-proposal";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import type { Group, CensusEntry } from "@shared/schema";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: Group;
  census?: CensusEntry[];
};

// Thresholds match the server (preferred < 1.0, standard 1.0–1.49, high ≥ 1.5).
function rowShade(score: number) {
  if (score <= 0.9) return "bg-green-50 dark:bg-green-950/20";
  if (score < 1.5) return "bg-amber-50 dark:bg-amber-950/20";
  return "bg-red-50 dark:bg-red-950/20";
}
function scoreTextClass(score: number) {
  if (score <= 0.9) return "text-green-700 dark:text-green-400";
  if (score < 1.5) return "text-amber-700 dark:text-amber-400";
  return "text-red-700 dark:text-red-400";
}

function downloadExcel(group: Group, rows: AgeBandRow[], census: CensusEntry[] | undefined, auditId: string) {
  const wb = XLSX.utils.book_new();

  const ageSheet = XLSX.utils.json_to_sheet(
    rows.map((r) => ({
      "Age Band": r.band,
      Females: r.females,
      Males: r.males,
      Total: r.total,
      "Avg Risk Score": r.avgRiskScore,
    })),
  );
  ageSheet["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ageSheet, "Age Band Analysis");

  if (census && census.length > 0) {
    const rosterSheet = XLSX.utils.json_to_sheet(
      census.map((r) => ({
        "First Name": r.firstName,
        "Last Name": r.lastName,
        Relationship: r.relationship,
        "Date of Birth": r.dateOfBirth,
        Gender: r.gender,
        "Zip Code": r.zipCode,
      })),
    );
    rosterSheet["!cols"] = [
      { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 8 }, { wch: 12 },
    ];
    XLSX.utils.book_append_sheet(wb, rosterSheet, "Roster");
  }

  const metaSheet = XLSX.utils.aoa_to_sheet([
    ["BenSync Score Audit"],
    [],
    ["Group", group.companyName],
    ["Risk Score", group.riskScore ?? ""],
    ["Risk Tier", group.riskTier ?? ""],
    ["Audit ID", auditId],
    ["Generated", new Date().toISOString()],
    [],
    ["Thresholds"],
    ["Preferred Risk", "< 1.00"],
    ["Standard Risk", "1.00 – 1.49"],
    ["High Risk", "≥ 1.50"],
  ]);
  metaSheet["!cols"] = [{ wch: 18 }, { wch: 32 }];
  XLSX.utils.book_append_sheet(wb, metaSheet, "Audit");

  const slug = (group.companyName || "group").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  XLSX.writeFile(wb, `${slug}_score_audit_${stamp}.xlsx`);
}

export function ScoreAuditDialog({ open, onOpenChange, group, census }: Props) {
  const review = useScoreReview(group.id, open);
  const tierConfig = group.riskTier ? TIER_CONFIG[group.riskTier as RiskTier] : null;
  const score = group.riskScore ?? review.data?.overallAvgRisk ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] max-w-3xl overflow-y-auto"
        data-testid="dialog-score-audit"
      >
        <DialogHeader>
          <DialogTitle className="sr-only">BenSync Score Audit</DialogTitle>
        </DialogHeader>

        {/* Header strip */}
        <div
          className="-mx-6 -mt-2 flex flex-wrap items-center justify-between gap-3 rounded-t-md px-6 py-4 text-white"
          style={{ background: tierConfig?.hsl ?? "hsl(215 50% 18%)" }}
        >
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-85">
              BenSync Score Audit
            </div>
            <div className="mt-0.5 flex items-baseline gap-3">
              <div className="text-3xl font-bold tabular-nums leading-none">
                {score.toFixed(2)}
              </div>
              <div className="text-sm font-semibold opacity-95">
                {tierConfig?.label ?? "Risk"}
              </div>
            </div>
            <div className="mt-1 text-xs opacity-80">{group.companyName}</div>
          </div>
          <div className="flex items-center gap-3">
            {review.data && (
              <div className="font-mono text-[11px] opacity-90" data-testid="text-audit-id">
                Audit #{review.data.auditId}
              </div>
            )}
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5"
              disabled={!review.data}
              onClick={() =>
                review.data && downloadExcel(group, review.data.ageBands, census, review.data.auditId)
              }
              data-testid="button-download-audit"
            >
              <Download className="h-3.5 w-3.5" />
              Download Excel
            </Button>
          </div>
        </div>

        {/* Age-band table */}
        <div className="overflow-hidden rounded-md border bg-card">
          <Table className="table-fixed">
            <colgroup>
              <col style={{ width: "22%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "24%" }} />
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead>Age Band</TableHead>
                <HeadR>Females</HeadR>
                <HeadR>Males</HeadR>
                <HeadR>Total</HeadR>
                <HeadR>Avg Risk Score</HeadR>
              </TableRow>
            </TableHeader>
            <TableBody>
              {review.isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell>
                </TableRow>
              )}
              {review.data?.ageBands.map((b) => {
                const empty = b.total === 0;
                return (
                  <TableRow key={b.band} className={cn(!empty && rowShade(b.avgRiskScore))}>
                    <TableCell className={cn("py-2 font-semibold", empty && "text-muted-foreground")}>
                      {b.band}
                    </TableCell>
                    <TableCell className="py-2 text-right font-mono tabular-nums">{b.females}</TableCell>
                    <TableCell className="py-2 text-right font-mono tabular-nums">{b.males}</TableCell>
                    <TableCell className="py-2 text-right font-mono font-semibold tabular-nums">
                      {b.total}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "py-2 text-right font-mono font-semibold tabular-nums",
                        !empty && scoreTextClass(b.avgRiskScore),
                        empty && "text-muted-foreground",
                      )}
                    >
                      {empty ? "-" : b.avgRiskScore.toFixed(3)}
                    </TableCell>
                  </TableRow>
                );
              })}
              {review.data && (
                <TableRow className="border-t-2 border-primary/40 bg-primary/5">
                  <TableCell className="py-2.5 font-bold">All Ages</TableCell>
                  <TableCell className="py-2.5 text-right font-mono font-bold tabular-nums">
                    {review.data.totals.females}
                  </TableCell>
                  <TableCell className="py-2.5 text-right font-mono font-bold tabular-nums">
                    {review.data.totals.males}
                  </TableCell>
                  <TableCell className="py-2.5 text-right font-mono font-bold tabular-nums">
                    {review.data.totals.total}
                  </TableCell>
                  <TableCell className="py-2.5 text-right font-mono font-bold tabular-nums">
                    {score.toFixed(3)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* AI audit card */}
        {review.data && (
          <div className="rounded-md border border-primary/25 bg-primary/[0.04] p-4">
            <div className="flex items-start gap-3">
              <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-sm font-semibold text-foreground">Score summary</div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {review.data.engineVersion}
                  </div>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {review.data.narrative}
                </p>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function HeadR({ children }: { children: React.ReactNode }) {
  return (
    <TableHead className="text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </TableHead>
  );
}
