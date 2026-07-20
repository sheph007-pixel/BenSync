import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  Lock,
  MapPin,
  Pencil,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TierBadge } from "./tier-badge";
import { ScoreAuditDialog } from "./score-audit-dialog";
import { useToast } from "@/hooks/use-toast";
import { useRenameGroup } from "@/hooks/use-proposal";
import { cn } from "@/lib/utils";
import { TIER_CONFIG, type RiskTier } from "@/pages/admin/constants";
import { inferRatingArea } from "@shared/rating-area";
import type { Group, CensusEntry } from "@shared/schema";

type Props = {
  group: Group;
  census?: CensusEntry[];
  onViewCensus?: () => void;
  // Public-share mode hides edit affordances: the rename pencil, the
  // score-audit popover, and (since the parent passes no
  // onViewCensus) the View Census button.
  readOnly?: boolean;
};

// Remembers expanded/collapsed across navigation so a broker who
// prefers the compact header on a smaller screen doesn't have to
// toggle every time they open a new group.
const STORAGE_KEY = "kennion:group-header-expanded";

function readInitialExpanded(): boolean {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === null ? true : raw === "1";
}

export function GroupHeader({ group, census, onViewCensus, readOnly }: Props) {
  const [auditOpen, setAuditOpen] = useState(false);
  const [expanded, setExpanded] = useState<boolean>(readInitialExpanded);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(group.companyName);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();
  const rename = useRenameGroup(group.id);

  // Keep the draft in sync when the group prop changes (e.g. after a
  // successful save refetches the cached record).
  useEffect(() => {
    if (!editingName) setDraftName(group.companyName);
  }, [group.companyName, editingName]);

  useEffect(() => {
    if (editingName) inputRef.current?.focus();
  }, [editingName]);

  function beginEdit() {
    if (group.locked || readOnly) return;
    setDraftName(group.companyName);
    setEditingName(true);
  }
  function cancelEdit() {
    setDraftName(group.companyName);
    setEditingName(false);
  }
  function commitEdit() {
    const next = draftName.trim();
    if (!next) {
      toast({ title: "Name required", description: "Company name can't be empty.", variant: "destructive" });
      return;
    }
    if (next === group.companyName) {
      setEditingName(false);
      return;
    }
    rename.mutate(next, {
      onSuccess: () => {
        setEditingName(false);
        toast({ title: "Name updated" });
      },
      onError: (err: any) => {
        toast({
          title: "Couldn't rename",
          description: err?.message ?? "Please try again.",
          variant: "destructive",
        });
      },
    });
  }

  const shortId = `KBA-${group.id.slice(0, 8).toUpperCase()}`;
  const submitted = group.submittedAt ? new Date(group.submittedAt) : null;
  const submittedLabel = submitted
    ? submitted.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const tier = group.riskTier as RiskTier | null;
  const tierConfig = tier && TIER_CONFIG[tier];

  // State + ZIP together drive the rating area, which is the actuarial
  // cost center for this group. Showing all three together makes the
  // pricing context obvious at a glance.
  const stateZip =
    group.state && group.zipCode
      ? `${group.state} ${group.zipCode}`
      : group.state || group.zipCode || null;
  const ratingArea =
    group.state || group.zipCode
      ? inferRatingArea(group.state, group.zipCode)
      : null;

  function toggle() {
    setExpanded((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      }
      return next;
    });
  }

  const ToggleBtn = (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-card text-muted-foreground hover-elevate"
      aria-label={expanded ? "Collapse group details" : "Expand group details"}
      data-testid="button-group-header-toggle"
    >
      {expanded ? (
        <ChevronUp className="h-4 w-4" />
      ) : (
        <ChevronDown className="h-4 w-4" />
      )}
    </button>
  );

  // Collapsed: single row with tier dot, company name, lives, and
  // actions on the right. Keeps the important context visible but
  // reclaims screen space for the rate tables below.
  if (!expanded) {
    return (
      <Card
        className="mb-6 flex items-center gap-3 px-5 py-3"
        data-testid="proposal-group-header"
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{
            background: tierConfig?.hsl ?? "hsl(var(--muted-foreground))",
          }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="truncate text-lg font-bold tracking-tight"
              data-testid="text-group-title"
            >
              {group.companyName}
            </span>
            {tierConfig && (
              <span
                className={cn(
                  "shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em]",
                  tierConfig.className,
                )}
              >
                {tier === "high" ? "Not Approved" : tierConfig.label}
              </span>
            )}
            {group.locked && (
              <Lock className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-label="Locked" />
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" aria-hidden />
              {group.totalLives ?? 0} lives
            </span>
            {stateZip && (
              <>
                <span aria-hidden>·</span>
                <span>{stateZip}</span>
              </>
            )}
            {ratingArea && (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" aria-hidden />
                  {ratingArea}
                </span>
              </>
            )}
          </div>
        </div>
        {onViewCensus && (
          <Button
            variant="outline"
            size="sm"
            onClick={onViewCensus}
            className="shrink-0 gap-1.5"
            data-testid="button-view-census"
          >
            <FileText className="h-3.5 w-3.5" />
            View Census
          </Button>
        )}
        {ToggleBtn}

        <ScoreAuditDialog
          open={auditOpen}
          onOpenChange={setAuditOpen}
          group={group}
          census={census}
        />
      </Card>
    );
  }

  return (
    <Card className="mb-6 p-6" data-testid="proposal-group-header">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <TierBadge tier={tier} />
          {group.riskScore != null && tierConfig && (
            readOnly ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-0.5 text-[11px] font-semibold tabular-nums"
                title="BenSync underwriting score"
                data-testid="badge-risk-score"
              >
                <Sparkles className="h-3 w-3" style={{ color: tierConfig.hsl }} />
                <span className="text-muted-foreground">BenSync Score</span>
                <span style={{ color: tierConfig.hsl }}>{group.riskScore.toFixed(2)}</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setAuditOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-0.5 text-[11px] font-semibold tabular-nums transition hover-elevate"
                title="View how this score was calculated"
                data-testid="badge-risk-score"
              >
                <Sparkles className="h-3 w-3" style={{ color: tierConfig.hsl }} />
                <span className="text-muted-foreground">BenSync Score</span>
                <span style={{ color: tierConfig.hsl }}>{group.riskScore.toFixed(2)}</span>
              </button>
            )
          )}
          {group.locked && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400"
              title="Locked by your BenSync advisor"
              data-testid="badge-locked"
            >
              <Lock className="h-3 w-3" />
              Locked
            </span>
          )}
        </div>
        {ToggleBtn}
      </div>
      <div className="mt-3 flex items-start gap-2">
        {editingName ? (
          <>
            <input
              ref={inputRef}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit();
                else if (e.key === "Escape") cancelEdit();
              }}
              maxLength={120}
              disabled={rename.isPending}
              className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-[34px] font-bold leading-tight tracking-tight text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
              data-testid="input-group-title"
            />
            <button
              type="button"
              onClick={commitEdit}
              disabled={rename.isPending}
              aria-label="Save name"
              className="mt-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-primary text-primary-foreground hover-elevate disabled:opacity-50"
              data-testid="button-save-group-name"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={rename.isPending}
              aria-label="Cancel"
              className="mt-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-card text-foreground hover-elevate disabled:opacity-50"
              data-testid="button-cancel-group-name"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            <h1
              className="min-w-0 flex-1 break-words text-[34px] font-bold leading-tight tracking-tight text-foreground"
              data-testid="text-group-title"
            >
              {group.companyName}
            </h1>
            {!group.locked && !readOnly && (
              <button
                type="button"
                onClick={beginEdit}
                aria-label="Edit company name"
                title="Edit company name"
                className="mt-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground hover-elevate"
                data-testid="button-edit-group-name"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span
            className="font-mono font-semibold tracking-wide text-foreground"
            data-testid="text-census-id"
          >
            Census {shortId}
          </span>
          {submittedLabel && (
            <>
              <span aria-hidden>·</span>
              <span data-testid="text-submitted-at">Submitted {submittedLabel}</span>
            </>
          )}
          {stateZip && (
            <>
              <span aria-hidden>·</span>
              <span data-testid="text-state-zip">{stateZip}</span>
            </>
          )}
          {ratingArea && (
            <span
              className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-foreground"
              title="Rating area used to price this group"
              data-testid="chip-rating-area"
            >
              <MapPin className="h-3 w-3 text-muted-foreground" aria-hidden />
              {ratingArea}
            </span>
          )}
        </div>
        {onViewCensus && (
          <Button
            variant="outline"
            size="sm"
            onClick={onViewCensus}
            className="gap-1.5"
            data-testid="button-view-census"
          >
            <FileText className="h-3.5 w-3.5" />
            View Census
          </Button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Employees" value={group.employeeCount ?? 0} testId="stat-employees" />
        <Stat label="Spouses" value={group.spouseCount ?? 0} testId="stat-spouses" />
        <Stat label="Children" value={group.childrenCount ?? 0} testId="stat-children" />
        <Stat label="Total Lives" value={group.totalLives ?? 0} emphasis testId="stat-total-lives" />
      </div>

      <ScoreAuditDialog
        open={auditOpen}
        onOpenChange={setAuditOpen}
        group={group}
        census={census}
      />
    </Card>
  );
}

function Stat({
  label,
  value,
  emphasis,
  testId,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
  testId?: string;
}) {
  return (
    <Card className={cn("p-3", emphasis && "border-primary/40 bg-primary/5")} data-testid={testId}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-xl font-bold tabular-nums">{value ?? 0}</div>
    </Card>
  );
}
