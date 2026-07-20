import { useState } from "react";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PublicProposalNav } from "@/components/proposal/public-proposal-nav";
import { ProposalFooter } from "@/components/proposal/proposal-footer";
import { BenefitGrid, type BenefitRow } from "@/components/proposal/benefit-grid";
import { usePublicQuote } from "@/hooks/use-public-quote";
import {
  MEDICAL_PLAN_DETAILS,
  DENTAL_PLAN_DETAILS,
  VISION_PLAN_DETAILS,
  SUPPLEMENTAL_COVERAGE,
  HOSPITAL_PLAN_DETAILS,
  ALL_PLANS_INCLUDE,
  type MedicalPlanBenefits,
  type DentalPlanBenefits,
  type VisionPlanBenefits,
  type HospitalPlanBenefits,
} from "@shared/plan-benefits";

export default function PublicPlanDetailsPage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/q/:token/plan-details");
  const token = params?.token;
  const { data, isLoading, isError } = usePublicQuote(token);
  const [activeTab, setActiveTab] = useState("medical");

  const selectedKey =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("plan")
      : null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <PublicProposalNav />
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-background">
        <PublicProposalNav />
        <div className="mx-auto max-w-xl px-6 py-16">
          <Card className="p-8">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
              Link not found
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">
              We couldn't open that proposal
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The link may have been revoked or it's still being prepared. Reach out to your BenSync advisor for a fresh link.
            </p>
            <Button
              className="mt-6"
              onClick={() => { window.location.href = "mailto:hunter@kennion.com"; }}
            >
              Email Hunter Shepherd
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  const group = data.group;
  const backPath = `/q/${token}`;

  return (
    <div className="min-h-screen bg-background">
      <PublicProposalNav />
      <div className="mx-auto max-w-[1280px] px-6 py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate(backPath)}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to rates
          </button>
          <div className="text-sm">
            <span className="text-muted-foreground">Plan details for </span>
            <span className="font-semibold text-foreground">{group.companyName}</span>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Plan Details</h1>
            <p className="mt-1 text-sm text-primary">{ALL_PLANS_INCLUDE}</p>
          </div>
          <a
            href="https://bensync.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover-elevate"
          >
            Program Website
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-auto gap-1 bg-muted p-1">
            <TabPill value="medical" active={activeTab === "medical"}>Medical</TabPill>
            <TabPill value="dental" active={activeTab === "dental"}>Dental</TabPill>
            <TabPill value="vision" active={activeTab === "vision"}>Vision</TabPill>
            <TabPill value="supplemental" active={activeTab === "supplemental"}>Supplemental</TabPill>
          </TabsList>

          <TabsContent value="medical" className="mt-5 min-h-[640px]">
            <BenefitGrid<MedicalPlanBenefits>
              plans={MEDICAL_PLAN_DETAILS}
              rows={medicalRows}
              selectedKey={selectedKey}
              labelColWidth={230}
              minPlanColWidth={130}
            />
          </TabsContent>

          <TabsContent value="dental" className="mt-5 min-h-[640px]">
            <BenefitGrid<DentalPlanBenefits>
              plans={DENTAL_PLAN_DETAILS}
              rows={dentalRows}
              selectedKey={selectedKey}
              labelColWidth={230}
              minPlanColWidth={140}
            />
          </TabsContent>

          <TabsContent value="vision" className="mt-5 min-h-[640px]">
            <BenefitGrid<VisionPlanBenefits>
              plans={VISION_PLAN_DETAILS}
              rows={visionRows}
              selectedKey={selectedKey}
              labelColWidth={230}
              minPlanColWidth={160}
            />
          </TabsContent>

          <TabsContent value="supplemental" className="mt-5 min-h-[640px] space-y-6">
            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Voluntary Benefits
              </h2>
              <div className="overflow-hidden rounded-md border bg-card">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-[hsl(215_50%_18%)] text-white">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em]">
                        Benefit
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em]">
                        Coverage
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {SUPPLEMENTAL_COVERAGE.map((s) => (
                      <tr key={s.key} className="border-b last:border-b-0">
                        <th
                          scope="row"
                          className="px-4 py-3 text-left align-top text-sm font-semibold"
                        >
                          {s.name}
                        </th>
                        <td className="px-4 py-3 align-top text-sm">
                          <div>{s.coverage}</div>
                          {s.note && (
                            <div className="mt-0.5 text-xs italic text-muted-foreground">
                              {s.note}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Voluntary Hospital
              </h2>
              <BenefitGrid<HospitalPlanBenefits>
                plans={HOSPITAL_PLAN_DETAILS}
                rows={hospitalRows}
                selectedKey={selectedKey}
                labelColWidth={230}
                minPlanColWidth={180}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
      <ProposalFooter />
    </div>
  );
}

const medicalRows: BenefitRow<MedicalPlanBenefits>[] = [
  { kind: "data", label: "Deductible", render: (p) => p.deductible },
  { kind: "data", label: "Out-of-Pocket Max", render: (p) => p.oopMax },
  { kind: "data", label: "$0 Preventive Care", render: (p) => p.preventiveCare },
  { kind: "data", label: "Benefits App + Concierge", render: (p) => p.benefitsApp },
  { kind: "data", label: "Visa Card For Expenses", render: (p) => p.visaCard },
  { kind: "section", label: "Benefits" },
  { kind: "data", label: "Virtual Primary Care Visits", render: (p) => p.virtualPrimary },
  { kind: "data", label: "Virtual Mental Health Visits", render: (p) => p.virtualMental },
  { kind: "data", label: "Virtual Urgent Care", render: (p) => p.virtualUrgent },
  { kind: "data", label: "Primary Care Office Visits", render: (p) => p.primaryCare },
  { kind: "data", label: "Specialist Office Visits", render: (p) => p.specialist },
  { kind: "data", label: "Emergency Room Facility Fee", render: (p) => p.er },
  { kind: "data", label: "Inpatient Facility Fee", render: (p) => p.inpatient },
  { kind: "data", label: "Outpatient Facility Fee", render: (p) => p.outpatient },
  { kind: "data", label: "RX | Generics", render: (p) => p.rxGeneric },
  { kind: "data", label: "RX | Brand: Preferred", render: (p) => p.rxBrandPreferred },
  { kind: "data", label: "RX | Brand: Non-preferred", render: (p) => p.rxBrandNonPreferred },
];

const dentalRows: BenefitRow<DentalPlanBenefits>[] = [
  { kind: "data", label: "Deductible", render: (p) => p.deductible },
  { kind: "data", label: "Annual Maximum Benefit", render: (p) => p.annualMax },
  { kind: "data", label: "Lifetime Ortho Maximum", render: (p) => p.lifetimeOrthoMax },
  { kind: "section", label: "Covered Services" },
  { kind: "data", label: "Preventative (Plan Pays)", render: (p) => p.preventativePct },
  { kind: "data", label: "Basic (Plan Pays)", render: (p) => p.basicPct },
  { kind: "data", label: "Major (Plan Pays)", render: (p) => p.majorPct },
  { kind: "data", label: "Ortho (Plan Pays)", render: (p) => p.orthoPct },
];

const visionRows: BenefitRow<VisionPlanBenefits>[] = [
  { kind: "data", label: "Exam Copayment", render: (p) => p.examCopay },
  { kind: "data", label: "Material Copayment", render: (p) => p.materialCopay },
  { kind: "data", label: "Exam Every", render: (p) => p.examEvery },
  { kind: "data", label: "Lenses Every", render: (p) => p.lensesEvery },
  { kind: "data", label: "Frames Every", render: (p) => p.framesEvery },
  { kind: "section", label: "Allowance" },
  { kind: "data", label: "Frames", render: (p) => p.framesAllowance },
  { kind: "data", label: "Elective Contact Lenses", render: (p) => p.electiveContactsAllowance },
  { kind: "data", label: "Necessary Contact Lenses", render: (p) => p.necessaryContactsAllowance },
];

const hospitalRows: BenefitRow<HospitalPlanBenefits>[] = [
  { kind: "section", label: "Inpatient Hospital" },
  { kind: "data", label: "Hospital Admission", render: (p) => p.inpatientAdmission },
  { kind: "section", label: "Other Facility Benefits" },
  { kind: "data", label: "Emergency Room / Urgent Care Facility", render: (p) => p.erUrgentCare },
  { kind: "section", label: "Surgeries" },
  { kind: "data", label: "Inpatient / Outpatient Surgery", render: (p) => p.surgery },
];

function TabPill({
  value,
  active,
  children,
}: {
  value: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <TabsTrigger
      value={value}
      className="rounded-md px-4 py-1.5 text-sm font-semibold data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-foreground"
      data-active={active || undefined}
    >
      {children}
    </TabsTrigger>
  );
}
