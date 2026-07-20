import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Download } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProposalNav } from "@/components/proposal/proposal-nav";
import { ProposalFooter } from "@/components/proposal/proposal-footer";
import { useToast } from "@/hooks/use-toast";
import {
  useGroupRates,
  useGroupCensus,
  useReplaceCensus,
  censusToMix,
} from "@/hooks/use-proposal";
import { usePublicQuoteRates, type TierMix } from "@/hooks/use-public-quote";
import { ProposalExportModal } from "@/components/proposal/proposal-export-modal";
import { ProposalAcceptModal } from "@/components/proposal/proposal-accept-modal";
import {
  DENTAL_PLANS,
  VISION_PLANS,
  computeMedicalTotal,
  effectiveDateOptions,
  fmtLong,
  toIsoDate,
  censusFileName,
} from "@/lib/kennion-rates";
import { GroupHeader } from "@/components/proposal/group-header";
import { EffectiveDatePicker } from "@/components/proposal/effective-date-picker";
import { ContributionControl } from "@/components/proposal/contribution-control";
import { MedicalTable } from "@/components/proposal/medical-table";
import { useHighRiskGate, HighRiskNotice } from "@/components/proposal/high-risk-gate";
import { MonthlyTotalCard } from "@/components/proposal/monthly-total-card";
import { SimpleRateTable } from "@/components/proposal/simple-rate-table";
import { SupplementalTables } from "@/components/proposal/supplemental-tables";
import { CensusModal } from "@/components/proposal/census-modal";
import type { Group } from "@shared/schema";

// Cockpit operating mode. Default ("session") is what an authenticated
// customer or admin sees: hooks talk to /api/groups + /api/rate, all
// affordances visible. "public" mode powers the logged-out /q/:token
// share link: hooks talk to /api/quote/:token, no auth, no PHI, and
// edit/replace/audit affordances are hidden.
export type CockpitMode =
  | { kind: "session" }
  | { kind: "public"; token: string; mix: TierMix };

type Props = {
  group: Group;
  onReplaceCensus?: () => void;
  // Optional content rendered between the top nav and the main layout.
  // Used by the admin view to overlay admin-only controls on top of
  // the same cockpit the customer sees. Accepts either a plain node or
  // a render function that receives the currently-selected effective
  // date, so the admin banner can pass that date into the Risk Screen
  // and keep funding numbers in lock-step with the cockpit.
  bannerSlot?: React.ReactNode | ((ctx: { effectiveDate: Date }) => React.ReactNode);
  // Defaults to { kind: "session" } so existing callers keep working
  // without any prop changes.
  mode?: CockpitMode;
  // Override the default <ProposalNav />. The public route uses this
  // to swap in a logged-out nav that doesn't fetch the user's groups.
  nav?: React.ReactNode;
  // URL the accept modal POSTs to. Defaults to the session-auth route;
  // public mode passes /api/quote/:token/accept.
  acceptUrl?: string;
};

export function ProposalCockpit({
  group,
  onReplaceCensus,
  bannerSlot,
  mode,
  nav,
  acceptUrl,
}: Props) {
  const resolvedMode: CockpitMode = mode ?? { kind: "session" };
  const { isHighRisk, screen: latestScreen } = useHighRiskGate(group?.id);
  const isPublic = resolvedMode.kind === "public";
  const [effDate, setEffDate] = useState(() => effectiveDateOptions()[0]);
  const [contribValue, setContribValue] = useState(0);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("medical");
  const [censusOpen, setCensusOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);

  const { toast } = useToast();
  const [location, navigate] = useLocation();
  // When admin is viewing a customer's group under /admin/groups/:id,
  // side nav links must stay in admin-space so the group fetch hits the
  // owner-or-admin endpoint and the ProposalNav keeps admin mode.
  const isAdminView = location.startsWith("/admin/groups/");
  // Hooks must run unconditionally (rules of hooks). Each one's
  // `enabled` flag is gated so only the active mode actually fetches.
  const sessionRatesQuery = useGroupRates(
    isPublic ? undefined : group.id,
    isPublic ? null : toIsoDate(effDate),
  );
  const publicRatesQuery = usePublicQuoteRates(
    isPublic && resolvedMode.kind === "public" ? resolvedMode.token : undefined,
    isPublic ? toIsoDate(effDate) : null,
  );
  const ratesQuery = isPublic ? publicRatesQuery : sessionRatesQuery;
  // No census fetch in public mode, individual rows are PHI-adjacent
  // and the cockpit never displays them to the prospect anyway.
  const censusQuery = useGroupCensus(isPublic ? undefined : group.id);
  // useReplaceCensus is a useMutation, fine to instantiate with
  // undefined; mutate() throws if invoked, but in public mode we never
  // mount the trigger button.
  const replaceCensus = useReplaceCensus(isPublic ? undefined : group.id);
  const plans = ratesQuery.data?.plans ?? [];
  const fileName = censusFileName(group);

  // Auto-select the top (most expensive / Platinum-tier) plan on first load.
  useEffect(() => {
    if (!selectedPlanId && plans.length > 0) {
      setSelectedPlanId(plans[0].id);
    }
  }, [plans, selectedPlanId]);

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId) ?? plans[0] ?? null,
    [plans, selectedPlanId],
  );
  const eeRate = selectedPlan?.base.EE ?? 0;
  // In public mode the server pre-computes the tier mix from the
  // census so we never have to ship those rows to the browser.
  const mix = useMemo(() => {
    if (resolvedMode.kind === "public") return resolvedMode.mix;
    return censusToMix(censusQuery.data);
  }, [resolvedMode, censusQuery.data]);

  const totals = useMemo(() => {
    if (!selectedPlan) return { gross: 0, employerCost: 0, employeeCost: 0 };
    return computeMedicalTotal(selectedPlan, mix, contribValue);
  }, [selectedPlan, mix, contribValue]);

  const isMedical = activeTab === "medical";

  return (
    <div className="min-h-screen bg-background">
      {nav ?? <ProposalNav />}
      {typeof bannerSlot === "function" ? bannerSlot({ effectiveDate: effDate }) : bannerSlot}
      <div className="mx-auto max-w-[1280px] px-6 py-6">
        <div className="grid grid-cols-[300px_1fr] gap-6">
          {/* LEFT RAIL */}
          <aside className="space-y-4">
            <Card className="p-5">
              <div className="mb-3 text-base font-semibold">Effective Date</div>
              <EffectiveDatePicker value={effDate} onChange={setEffDate} />
            </Card>

            {isMedical && selectedPlan && (
              <ContributionControl
                value={contribValue}
                eeRate={eeRate}
                onChange={setContribValue}
              />
            )}

            {isMedical && selectedPlan && !isHighRisk && (
              <MonthlyTotalCard
                planName={selectedPlan.name}
                effectiveDate={effDate}
                gross={totals.gross}
                employerCost={totals.employerCost}
                employeeCost={totals.employeeCost}
              />
            )}

            <div className="space-y-2">
              {!isHighRisk && (
              <Button
                className="w-full justify-center gap-1.5"
                onClick={() => setAcceptOpen(true)}
                data-testid="button-accept-proposal"
              >
                Accept Proposal
                <ArrowRight className="h-4 w-4" />
              </Button>
              )}
              <Button
                variant="outline"
                className="w-full justify-center gap-1.5"
                onClick={() => setExportOpen(true)}
                data-testid="button-download-pdf"
              >
                <Download className="h-4 w-4" />
                Download / Print
              </Button>
            </div>
          </aside>

          {/* MAIN */}
          <main className="min-w-0">
            <GroupHeader
              group={group}
              census={censusQuery.data}
              onViewCensus={isPublic ? undefined : () => setCensusOpen(true)}
              readOnly={isPublic}
            />

            <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
              <div className="flex items-center gap-2">
                <TabsList className="h-auto gap-1 bg-muted p-1">
                  <TabPill value="medical" count={plans.length || undefined} active={activeTab === "medical"}>
                    Medical
                  </TabPill>
                  <TabPill value="dental" count={DENTAL_PLANS.length} active={activeTab === "dental"}>
                    Dental
                  </TabPill>
                  <TabPill value="vision" count={VISION_PLANS.length} active={activeTab === "vision"}>
                    Vision
                  </TabPill>
                  <TabPill value="supplemental" active={activeTab === "supplemental"}>
                    Supplemental
                  </TabPill>
                </TabsList>
                <button
                  type="button"
                  className="ml-auto inline-flex items-center gap-1 rounded-md border bg-card px-3 py-1.5 text-sm font-semibold text-foreground hover-elevate"
                  onClick={() => {
                    const q = selectedPlan ? `?plan=${encodeURIComponent(selectedPlan.name)}` : "";
                    const base = isPublic
                      ? `/q/${(resolvedMode as { kind: "public"; token: string }).token}/plan-details`
                      : isAdminView
                        ? `/admin/groups/${group.id}/plan-details`
                        : `/dashboard/${group.id}/plan-details`;
                    navigate(`${base}${q}`);
                  }}
                  data-testid="button-compare-plan-details"
                >
                  Compare Plan Details
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              <TabsContent value="medical" className="mt-5 min-h-[640px] space-y-4">
                <SectionHeader
                  title="Medical Plans"
                  subtitle={
                    <>
                      Rates recalculated for <strong>{group.companyName}</strong> · effective{" "}
                      <strong>{fmtLong(effDate)}</strong>. Select a plan below to see your monthly total.
                    </>
                  }
                />
                {isHighRisk ? (
                  <HighRiskNotice
                    groupName={group.companyName || (group as any).name}
                    score={latestScreen?.kri}
                  />
                ) : (
                  <>
                    {ratesQuery.isLoading && <div className="text-sm text-muted-foreground">Pricing…</div>}
                    {ratesQuery.isError && (
                      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                        Could not load rates. Refresh to try again.
                      </div>
                    )}
                    {plans.length > 0 && (
                      <MedicalTable plans={plans} selectedId={selectedPlanId} onSelect={setSelectedPlanId} />
                    )}
                  </>
                )}
              </TabsContent>

              <TabsContent value="dental" className="mt-5 min-h-[640px] space-y-4">
                <SectionHeader title="Dental Plans" subtitle="Fixed rates · calendar year 2026" />
                <SimpleRateTable plans={DENTAL_PLANS} label="Dental Plan Name" />
              </TabsContent>

              <TabsContent value="vision" className="mt-5 min-h-[640px] space-y-4">
                <SectionHeader title="Vision Plans" subtitle="Fixed rates · calendar year 2026" />
                <SimpleRateTable plans={VISION_PLANS} label="Vision Plan Name" />
              </TabsContent>

              <TabsContent value="supplemental" className="mt-5 min-h-[640px] space-y-4">
                <SectionHeader
                  title="Supplemental Benefits"
                  subtitle="Voluntary, employee-paid, fixed rates for 2026"
                />
                <SupplementalTables />
              </TabsContent>
            </Tabs>
          </main>
        </div>
      </div>
      <ProposalFooter />

      {!isPublic && (
        <CensusModal
          open={censusOpen}
          onOpenChange={setCensusOpen}
          entries={censusQuery.data}
          censusFileName={fileName}
          submittedAt={group.submittedAt}
          locked={group.locked}
          onReplace={() => onReplaceCensus?.()}
          onSave={async (rows) => {
            try {
              await replaceCensus.mutateAsync(rows);
              toast({
                title: "Census updated",
                description: "Rates recalculated for the new roster.",
              });
            } catch (err: any) {
              toast({
                title: "Could not update census",
                description: err?.message ?? "Please try again.",
                variant: "destructive",
              });
              throw err;
            }
          }}
        />
      )}

      <ProposalExportModal
        open={exportOpen}
        onOpenChange={setExportOpen}
        group={group}
        effectiveDate={effDate}
        plans={plans}
      />

      <ProposalAcceptModal
        open={acceptOpen}
        onOpenChange={setAcceptOpen}
        group={group}
        preselectedPlan={selectedPlan?.name ?? null}
        acceptUrl={acceptUrl}
      />
    </div>
  );
}

function TabPill({
  value,
  count,
  active,
  children,
}: {
  value: string;
  count?: number;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <TabsTrigger
      value={value}
      className="gap-2 rounded-md px-4 py-1.5 text-sm font-semibold data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-foreground"
      data-testid={`tab-${value}`}
    >
      {children}
      {count != null && (
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
          }`}
        >
          {count}
        </span>
      )}
    </TabsTrigger>
  );
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

