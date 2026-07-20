import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Building2, Loader2, Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ProposalNav } from "@/components/proposal/proposal-nav";
import { useMyGroups } from "@/hooks/use-proposal";
import { TIER_CONFIG, type RiskTier } from "@/pages/admin/constants";
import { cn } from "@/lib/utils";
import type { Group } from "@shared/schema";

// Full-page groups gallery. Entered by clicking the group chip in the
// top nav. Designed for brokers with many client groups, search at the
// top, a card per group with tier/lives/date at a glance, and a
// first-class "New Group" CTA rather than hiding it at the bottom of a
// dropdown.
export default function GroupsPage() {
  const [, navigate] = useLocation();
  const { groups, isLoading } = useMyGroups();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.companyName?.toLowerCase().includes(q));
  }, [groups, search]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <ProposalNav />
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <ProposalNav />
      <div className="mx-auto max-w-[1280px] px-6 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
              <Building2 className="h-3.5 w-3.5" />
              Your groups
            </div>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              Groups &amp; Quotes
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick a group to open its proposal, or start a new quote.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="px-3 py-1">
              {groups.length} {groups.length === 1 ? "group" : "groups"}
            </Badge>
            <Button
              onClick={() => navigate("/dashboard/new")}
              data-testid="button-new-group"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              New Group
            </Button>
          </div>
        </div>

        {groups.length > 0 && (
          <div className="mb-5">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search groups by company name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-groups-search"
              />
            </div>
          </div>
        )}

        {groups.length === 0 ? (
          <EmptyState onNew={() => navigate("/dashboard/new")} />
        ) : filtered.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">
            No groups match "{search}".
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((g) => (
              <GroupCard
                key={g.id}
                group={g}
                onOpen={() => navigate(`/dashboard/${g.id}`)}
              />
            ))}
            <NewGroupCard onClick={() => navigate("/dashboard/new")} />
          </div>
        )}
      </div>
    </div>
  );
}

function GroupCard({ group, onOpen }: { group: Group; onOpen: () => void }) {
  const tier = group.riskTier as RiskTier | null;
  const tierConfig = tier && TIER_CONFIG[tier];
  // High-risk groups read "Not Approved", every other tier shows its
  // own tier label. Matches the cockpit TierBadge wording.
  const tierLabel = tier === "high" ? "Not Approved" : tierConfig?.label;
  const submitted = group.submittedAt ? new Date(group.submittedAt) : null;
  const submittedLabel = submitted
    ? submitted.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;
  const location =
    group.state && group.zipCode
      ? `${group.state} · ${group.zipCode}`
      : group.state || group.zipCode || null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group text-left"
      data-testid={`card-group-${group.id}`}
    >
      <Card className="h-full p-5 transition hover-elevate group-focus-visible:ring-2 group-focus-visible:ring-primary">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{
                background: tierConfig?.hsl ?? "hsl(var(--muted-foreground))",
              }}
              aria-hidden
            />
            <span className={cn("text-xs font-medium", tierConfig?.className)}>
              {tierLabel ?? "Pending analysis"}
            </span>
          </div>
          {submittedLabel && (
            <span className="text-[11px] text-muted-foreground">
              {submittedLabel}
            </span>
          )}
        </div>

        <div className="mt-3 truncate text-lg font-semibold tracking-tight">
          {group.companyName}
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            <span>
              {group.totalLives ?? 0}{" "}
              {group.totalLives === 1 ? "life" : "lives"}
            </span>
          </div>
          {location && <span className="truncate">{location}</span>}
        </div>
      </Card>
    </button>
  );
}

function NewGroupCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left"
      data-testid="card-new-group"
    >
      <Card className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 border-dashed p-5 text-primary transition hover-elevate group-focus-visible:ring-2 group-focus-visible:ring-primary">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <Plus className="h-5 w-5" />
        </div>
        <div className="text-sm font-semibold">New Group</div>
        <div className="text-center text-xs text-muted-foreground">
          Upload a census to start a new quote.
        </div>
      </Card>
    </button>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <Card className="flex flex-col items-center gap-4 p-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Building2 className="h-6 w-6" />
      </div>
      <div>
        <div className="text-lg font-semibold tracking-tight">
          No groups yet
        </div>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Upload your first census to generate a proposal. You can add more
          groups any time.
        </p>
      </div>
      <Button onClick={onNew} data-testid="button-empty-new-group">
        <Plus className="mr-1.5 h-4 w-4" />
        New Group
      </Button>
    </Card>
  );
}
