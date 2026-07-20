import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DENTAL_PLANS, VISION_PLANS } from "@/lib/kennion-rates";
import { cn } from "@/lib/utils";
import type { Group } from "@shared/schema";

// Acceptance form, the popup version of the Typeform that collects
// plan selections + company/contact/attestation and emails the
// submission to Kennion. Mirrors the Typeform's 4-step structure but
// each step renders all its questions on one screen so it's faster to
// complete. Values we already know (company name, contact details,
// currently-selected medical plan) are pre-filled; every field is
// editable.

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: Group;
  preselectedPlan: string | null;
  // Optional override for the POST target. Defaults to the
  // session-auth route used by the customer dashboard. The public
  // /q/:token cockpit passes /api/quote/:token/accept.
  acceptUrl?: string;
};

// The 15 medical plans the cockpit shows under Medical, must match
// that list so "Health Plans" here pairs with the quoted rates.
const HEALTH_PLAN_OPTIONS = [
  "Deluxe Platinum",
  "Choice Gold",
  "Basic Gold",
  "Preferred Silver",
  "Enhanced Silver",
  "Classic Silver",
  "Saver HSA",
  "Elite Health",
  "Premier Health",
  "Select Health",
  "Core Health",
  "Freedom Platinum",
  "Freedom Gold",
  "Freedom Silver",
  "Freedom Bronze",
];

const SUPPLEMENTAL_OPTION = "Automatically Included / No Direct Cost";

const EMPLOYER_LIFE_OPTIONS = [
  "$10,000 Life ($2.40 Per Employee)",
  "$25,000 Life ($6.00 Per Employee)",
  "$50,000 Life ($12.00 Per Employee)",
  "$100,000 Life ($24.00 Per Employee)",
  "I don't want Employer Paid Life",
];

type AcceptState = {
  plans: {
    health: string[];
    dental: string[];
    vision: string[];
    supplemental: string;
    employerPaidLife: string;
  };
  company: {
    legalName: string;
    taxId: string;
    streetAddress: string;
    cityStateZip: string;
  };
  contact: {
    name: string;
    workEmail: string;
    ssnLast4: string;
    ssnLast4Verify: string;
    title: string;
    phone: string;
    reason: string;
  };
  acceptance: {
    additionalComments: string;
  };
};

function initialState(group: Group, _preselected: string | null): AcceptState {
  // Intentionally start every plan selection blank so the user has to
  // actively pick their coverage on each question, carrying the
  // cockpit's hover / quote selection over felt presumptuous. Company
  // + contact info still seeds from the group record since those are
  // facts we already know.
  return {
    plans: {
      health: [],
      dental: [],
      vision: [],
      supplemental: "",
      employerPaidLife: "",
    },
    company: {
      legalName: group.companyName ?? "",
      taxId: "",
      streetAddress: "",
      cityStateZip: [group.state, group.zipCode].filter(Boolean).join(" "),
    },
    contact: {
      name: group.contactName ?? "",
      workEmail: group.contactEmail ?? "",
      ssnLast4: "",
      ssnLast4Verify: "",
      title: "",
      phone: group.contactPhone ?? "",
      reason: "",
    },
    acceptance: {
      additionalComments: "",
    },
  };
}

export function ProposalAcceptModal({ open, onOpenChange, group, preselectedPlan, acceptUrl }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<AcceptState>(() => initialState(group, preselectedPlan));
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Re-seed when the modal is opened fresh. Closing doesn't lose the
  // in-progress state (nice if they accidentally click away) but a new
  // session always starts clean.
  useEffect(() => {
    if (open) return;
    // Reset on close, a beat later so we don't flash the empty form
    // while the dialog's exit animation runs.
    const t = setTimeout(() => {
      setStep(0);
      setState(initialState(group, preselectedPlan));
      setSubmitted(false);
    }, 250);
    return () => clearTimeout(t);
  }, [open, group, preselectedPlan]);

  const stepValidation = useMemo(() => validateStep(step, state), [step, state]);
  const canContinue = stepValidation.ok;

  async function handleSubmit() {
    if (!stepValidation.ok) return;
    setSubmitting(true);
    try {
      const url = acceptUrl ?? `/api/groups/${group.id}/accept`;
      await apiRequest("POST", url, state);
      // Refresh groups cache so status badge flips immediately. Public
      // mode has no /api/groups list to invalidate, but invalidating an
      // unfetched key is a no-op so it's safe to leave unconditional.
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      setSubmitted(true);
    } catch (err: any) {
      toast({
        title: "Could not submit",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  function onNext() {
    if (!canContinue || submitting) return;
    if (step < TOTAL_STEPS - 1) setStep(step + 1);
    else handleSubmit();
  }
  function onPrev() {
    if (step === 0) onOpenChange(false);
    else setStep(step - 1);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {submitted ? "Proposal accepted" : "Accept Proposal"}
          </DialogTitle>
        </DialogHeader>

        {submitted ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle2 className="h-8 w-8 text-green-700 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Thanks! Your submission was sent to your BenSync advisor. Hunter Shepherd will
                reach out shortly to finalize enrollment for{" "}
                <strong className="text-foreground">{state.company.legalName || group.companyName}</strong>.
              </p>
            </div>
            <Button onClick={() => onOpenChange(false)} data-testid="button-accept-done">
              Close
            </Button>
          </div>
        ) : (
          <>
            <Progress value={((step + 1) / TOTAL_STEPS) * 100} className="h-1" />
            <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
              {STEP_META[step].eyebrow}
            </div>
            <h3 className="text-xl font-bold tracking-tight">{STEP_META[step].title}</h3>
            {STEP_META[step].subtitle && (
              <p className="-mt-1 text-sm text-muted-foreground">{STEP_META[step].subtitle}</p>
            )}

            <div className="mt-4 space-y-5">
              {step === 0 && <Step1Plans state={state} setState={setState} />}
              {step === 1 && <Step2Company state={state} setState={setState} />}
              {step === 2 && <Step3Contact state={state} setState={setState} />}
              {step === 3 && <Step4Acceptance state={state} setState={setState} />}
            </div>

            {stepValidation.ok === false && stepValidation.message && (
              <p className="mt-3 text-xs font-medium text-destructive">{stepValidation.message}</p>
            )}

            <div className="mt-5 flex items-center justify-between gap-3 border-t pt-4">
              <Button variant="outline" onClick={onPrev} disabled={submitting} className="gap-1.5">
                <ArrowLeft className="h-4 w-4" />
                {step === 0 ? "Cancel" : "Back"}
              </Button>
              <Button
                onClick={onNext}
                disabled={!canContinue || submitting}
                className="gap-1.5"
                data-testid="button-accept-next"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : step === TOTAL_STEPS - 1 ? (
                  "I ACCEPT"
                ) : (
                  <>
                    Continue <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Validation ───────────────────────────────────────────────────────

const TOTAL_STEPS = 4;

const STEP_META: Array<{ eyebrow: string; title: string; subtitle?: string }> = [
  { eyebrow: "Step 1 of 4", title: "Select your plans", subtitle: "Choose the coverage you'd like to offer." },
  { eyebrow: "Step 2 of 4", title: "Company info", subtitle: "We need the legal entity for enrollment." },
  { eyebrow: "Step 3 of 4", title: "Contact details", subtitle: "Who should we work with to finalize?" },
  { eyebrow: "Step 4 of 4", title: "Acceptance" },
];

type Validation = { ok: true } | { ok: false; message: string };

function validateStep(step: number, s: AcceptState): Validation {
  if (step === 0) {
    if (s.plans.health.length < 1 || s.plans.health.length > 3)
      return { ok: false, message: "Choose 1–3 health plans." };
    if (s.plans.dental.length < 1 || s.plans.dental.length > 2)
      return { ok: false, message: "Choose 1–2 dental plans." };
    if (s.plans.vision.length < 1 || s.plans.vision.length > 2)
      return { ok: false, message: "Choose 1–2 vision plans." };
    if (!s.plans.supplemental) return { ok: false, message: "Confirm the supplemental package." };
    if (!s.plans.employerPaidLife)
      return { ok: false, message: "Choose an Employer Paid Life option (or decline)." };
    return { ok: true };
  }
  if (step === 1) {
    if (!s.company.legalName.trim()) return { ok: false, message: "Company legal name is required." };
    if (!s.company.taxId.trim()) return { ok: false, message: "Company Tax ID is required." };
    if (!s.company.streetAddress.trim()) return { ok: false, message: "Street address is required." };
    if (!s.company.cityStateZip.trim()) return { ok: false, message: "City, state & ZIP are required." };
    return { ok: true };
  }
  if (step === 2) {
    if (!s.contact.name.trim()) return { ok: false, message: "Contact name is required." };
    if (!/.+@.+\..+/.test(s.contact.workEmail)) return { ok: false, message: "Enter a valid work email." };
    if (!/^\d{4}$/.test(s.contact.ssnLast4))
      return { ok: false, message: "SSN last 4 must be exactly 4 digits." };
    if (s.contact.ssnLast4 !== s.contact.ssnLast4Verify)
      return { ok: false, message: "SSN confirmation does not match." };
    if (!s.contact.title.trim()) return { ok: false, message: "Title is required." };
    if (!s.contact.phone.trim()) return { ok: false, message: "Contact phone is required." };
    if (!s.contact.reason.trim())
      return { ok: false, message: "A quick note about why you're joining helps us serve you better." };
    return { ok: true };
  }
  if (step === 3) {
    if (!s.acceptance.additionalComments.trim())
      return { ok: false, message: "Add any final comments or feedback to continue." };
    return { ok: true };
  }
  return { ok: true };
}

// ── Step 1: Plans ────────────────────────────────────────────────────

function Step1Plans({
  state,
  setState,
}: {
  state: AcceptState;
  setState: React.Dispatch<React.SetStateAction<AcceptState>>;
}) {
  function togglePlan(field: "health" | "dental" | "vision", name: string, max: number) {
    setState((s) => {
      const current = s.plans[field];
      const next = current.includes(name)
        ? current.filter((x) => x !== name)
        : current.length >= max
          ? current
          : [...current, name];
      return { ...s, plans: { ...s.plans, [field]: next } };
    });
  }
  return (
    <div className="space-y-5">
      <MultiSelectGroup
        label="Health Plans"
        subtitle="Choose up to 3"
        options={HEALTH_PLAN_OPTIONS}
        selected={state.plans.health}
        max={3}
        onToggle={(name) => togglePlan("health", name, 3)}
      />
      <MultiSelectGroup
        label="Dental Plans"
        subtitle="Choose up to 2"
        options={DENTAL_PLANS.map((p) => p.name)}
        selected={state.plans.dental}
        max={2}
        onToggle={(name) => togglePlan("dental", name, 2)}
      />
      <MultiSelectGroup
        label="Vision Plans"
        subtitle="Choose up to 2"
        options={VISION_PLANS.map((p) => p.name)}
        selected={state.plans.vision}
        max={2}
        onToggle={(name) => togglePlan("vision", name, 2)}
      />

      <div className="space-y-1.5">
        <Label>Supplemental Package (Guardian)</Label>
        <p className="text-xs text-muted-foreground">
          Automatically included, our program covers Accident, Critical Illness, Cancer,
          Hospital, and Disability. Employees can opt into what they need; the employer
          pays nothing directly.
        </p>
        <SingleSelectGroup
          options={[SUPPLEMENTAL_OPTION]}
          selected={state.plans.supplemental}
          onSelect={(v) => setState((s) => ({ ...s, plans: { ...s.plans, supplemental: v } }))}
        />
      </div>

      <div className="space-y-1.5">
        <Label>100% Employer Paid Life Insurance (Guardian)</Label>
        <p className="text-xs text-muted-foreground">Optional employer-paid benefit. Prices are monthly per employee.</p>
        <SingleSelectGroup
          options={EMPLOYER_LIFE_OPTIONS}
          selected={state.plans.employerPaidLife}
          onSelect={(v) => setState((s) => ({ ...s, plans: { ...s.plans, employerPaidLife: v } }))}
        />
      </div>
    </div>
  );
}

// ── Step 2: Company ──────────────────────────────────────────────────

function Step2Company({
  state,
  setState,
}: {
  state: AcceptState;
  setState: React.Dispatch<React.SetStateAction<AcceptState>>;
}) {
  const set = (k: keyof AcceptState["company"]) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setState((s) => ({ ...s, company: { ...s.company, [k]: e.target.value } }));
  return (
    <div className="space-y-3">
      <Field id="legalName" label="Company Legal Name" required>
        <Input
          id="legalName"
          value={state.company.legalName}
          onChange={set("legalName")}
          data-testid="input-company-legal-name"
        />
      </Field>
      <Field id="taxId" label="Company Tax ID" required>
        <Input
          id="taxId"
          value={state.company.taxId}
          onChange={set("taxId")}
          placeholder="FEIN, e.g. 12-3456789"
          data-testid="input-company-tax-id"
        />
      </Field>
      <Field id="streetAddress" label="Company Street Address" required>
        <Input
          id="streetAddress"
          value={state.company.streetAddress}
          onChange={set("streetAddress")}
          data-testid="input-company-street"
        />
      </Field>
      <Field id="cityStateZip" label="City, State & ZIP" required>
        <Input
          id="cityStateZip"
          value={state.company.cityStateZip}
          onChange={set("cityStateZip")}
          placeholder="Birmingham, AL 35242"
          data-testid="input-company-city-state-zip"
        />
      </Field>
    </div>
  );
}

// ── Step 3: Contact ──────────────────────────────────────────────────

function Step3Contact({
  state,
  setState,
}: {
  state: AcceptState;
  setState: React.Dispatch<React.SetStateAction<AcceptState>>;
}) {
  const set = (k: keyof AcceptState["contact"]) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setState((s) => ({ ...s, contact: { ...s.contact, [k]: e.target.value } }));

  const ssnHandler = (k: "ssnLast4" | "ssnLast4Verify") => (e: React.ChangeEvent<HTMLInputElement>) => {
    // Digits only, max 4, enforce at type-time so bad input never
    // reaches state.
    const v = e.target.value.replace(/\D/g, "").slice(0, 4);
    setState((s) => ({ ...s, contact: { ...s.contact, [k]: v } }));
  };

  return (
    <div className="space-y-3">
      <Field id="contactName" label="Contact Name" required subtitle="Enter your full legal name">
        <Input
          id="contactName"
          value={state.contact.name}
          onChange={set("name")}
          data-testid="input-contact-name"
        />
      </Field>
      <Field id="contactEmail" label="Contact Work Email" required>
        <Input
          id="contactEmail"
          type="email"
          value={state.contact.workEmail}
          onChange={set("workEmail")}
          data-testid="input-contact-email"
        />
      </Field>
      {/* Single label+subtitle block above a clean two-input row so
          both SSN inputs share the same baseline, a per-field
          subtitle on only one side leaves the other input sitting
          higher. */}
      <div className="space-y-1.5">
        <Label>
          Last 4 of SSN
          <span className="ml-0.5 text-destructive">*</span>
        </Label>
        <p className="text-xs text-muted-foreground">
          Used for compliance only. Enter the same four digits in both fields.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            id="ssn4"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={state.contact.ssnLast4}
            onChange={ssnHandler("ssnLast4")}
            placeholder="Last 4 of SSN"
            maxLength={4}
            data-testid="input-ssn-last4"
          />
          <Input
            id="ssn4v"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={state.contact.ssnLast4Verify}
            onChange={ssnHandler("ssnLast4Verify")}
            placeholder="Verify last 4"
            maxLength={4}
            data-testid="input-ssn-last4-verify"
          />
        </div>
      </div>
      <Field id="title" label="Title" required>
        <Input
          id="title"
          value={state.contact.title}
          onChange={set("title")}
          placeholder="e.g. CEO, HR Director"
          data-testid="input-title"
        />
      </Field>
      <Field id="phone" label="Contact Phone Number" required>
        <Input
          id="phone"
          type="tel"
          value={state.contact.phone}
          onChange={set("phone")}
          placeholder="(205) 555-0123"
          data-testid="input-phone"
        />
      </Field>
      <Field id="reason" label="Why did you decide to move forward with BenSync?">
        <textarea
          id="reason"
          rows={3}
          value={state.contact.reason}
          onChange={set("reason")}
          className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          data-testid="input-reason"
        />
      </Field>
    </div>
  );
}

// ── Step 4: Acceptance ───────────────────────────────────────────────

function Step4Acceptance({
  state,
  setState,
}: {
  state: AcceptState;
  setState: React.Dispatch<React.SetStateAction<AcceptState>>;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-md border bg-muted/30 p-4 text-sm leading-relaxed text-foreground">
        <p>
          By clicking <strong>I ACCEPT</strong>, I confirm that I am an authorized representative of the
          enrolling employer and that I've reviewed and understand the structure of the BenSync Benefits
          Program. This is a level-funded employee benefits program powered by a private group captive and
          professionally managed by Strategic Risk Solutions (SRS), the world's largest independent captive
          manager. SRS will provide all required enrollment documents for review and signature.
        </p>
        <p>
          I understand that program participation requires membership in the American Employers Alliance, a
          nonprofit association, and that the only separate fee is the flat $99/month association membership,
          which grants access to the full benefits platform. All monthly rates shown in the proposal reflect
          what the group will pay directly for health, dental, vision, and supplemental coverage, and are
          subject to change each calendar year.
        </p>
        <p>
          I confirm that the information submitted is accurate to the best of my knowledge and agree to notify
          BenSync of any material changes. By continuing, the employer agrees to participate
          in the BenSync Benefits Program and partner with BenSync to deliver high-quality, cost-effective
          benefits to our team.
        </p>
      </div>

      <Field id="comments" label="Any additional comments or feedback for us?" required>
        <textarea
          id="comments"
          rows={3}
          value={state.acceptance.additionalComments}
          onChange={(e) =>
            setState((s) => ({
              ...s,
              acceptance: { ...s.acceptance, additionalComments: e.target.value },
            }))
          }
          className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          data-testid="input-additional-comments"
        />
      </Field>
    </div>
  );
}

// ── Small shared UI helpers ──────────────────────────────────────────

function Field({
  id,
  label,
  subtitle,
  required,
  children,
}: {
  id: string;
  label: string;
  subtitle?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      {children}
    </div>
  );
}

function MultiSelectGroup({
  label,
  subtitle,
  options,
  selected,
  max,
  onToggle,
}: {
  label: string;
  subtitle: string;
  options: string[];
  selected: string[];
  max: number;
  onToggle: (name: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        <span className="ml-0.5 text-destructive">*</span>
      </Label>
      <p className="text-xs text-muted-foreground">
        {subtitle} · {selected.length} selected
      </p>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {options.map((name) => {
          const active = selected.includes(name);
          const disabled = !active && selected.length >= max;
          return (
            <button
              key={name}
              type="button"
              onClick={() => onToggle(name)}
              disabled={disabled}
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition",
                active
                  ? "border-primary bg-primary/5 text-foreground"
                  : disabled
                    ? "border-border bg-card/50 text-muted-foreground opacity-50"
                    : "border-border bg-card hover-elevate",
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-input",
                )}
                aria-hidden
              >
                {active && <CheckCircle2 className="h-3 w-3" />}
              </span>
              <span className="min-w-0 truncate">{name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SingleSelectGroup({
  options,
  selected,
  onSelect,
}: {
  options: string[];
  selected: string;
  onSelect: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {options.map((name) => {
        const active = selected === name;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onSelect(name)}
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition",
              active
                ? "border-primary bg-primary/5 text-foreground"
                : "border-border bg-card hover-elevate",
            )}
          >
            <span
              className={cn(
                "flex h-4 w-4 shrink-0 rounded-full border",
                active ? "border-primary" : "border-input",
              )}
              aria-hidden
            >
              {active && <span className="m-auto h-2 w-2 rounded-full bg-primary" />}
            </span>
            <span className="min-w-0">{name}</span>
          </button>
        );
      })}
    </div>
  );
}
