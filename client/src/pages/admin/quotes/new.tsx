import { useState } from "react";
import { ArrowLeft, ArrowRight, Building2, Loader2, Mail, Phone, ShieldCheck, User } from "lucide-react";
import { useLocation, useSearch } from "wouter";
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
import { ProposalNav } from "@/components/proposal/proposal-nav";
import { ProposalUpload } from "@/pages/proposal/upload";
import { useToast } from "@/hooks/use-toast";
import { useStashQuoteDetails } from "@/hooks/use-admin-quotes";
import { US_STATES } from "@shared/schema";

// Two-step admin wizard for creating a sales-rep-driven quote.
//
//   Step 1, Prospect basics (company + state/zip; contact info is
//            optional so reps can crank quotes fast and let the
//            prospect fill it via the Accept modal).
//            POST /api/admin/quotes/pending stashes details in the
//            session, NO DB row yet.
//   Step 2, Census upload. Server validates → atomically creates
//            quote + census on success. If the upload fails, no
//            orphan "Draft" row is left behind because nothing was
//            created in the first place.
//
// The current step travels in the URL as `?step=upload`. Refresh at
// step 2 still has the session-stashed details; if the session is
// empty (cookie cleared, etc.) the upload step will surface a clear
// error from the server and the rep starts over.
export default function AdminQuoteWizardPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const step = new URLSearchParams(search).get("step") === "upload" ? "upload" : "details";

  if (step === "details") {
    return <DetailsStep onContinue={() => navigate("/admin/quotes/new?step=upload")} />;
  }
  return (
    <ProposalUpload
      adminQuoteFlow
      title="Upload the prospect's census"
      subtitle={
        <>
          Upload the prospect's CSV. We'll run the same AI cleaning, scoring, and
          rate engine as a customer-driven quote, then return you to the cockpit
          to grab the public link for the prospect.
        </>
      }
      nav={<ProposalNav />}
      onComplete={(g) => navigate(`/admin/groups/${g.id}`)}
    />
  );
}

function DetailsStep({ onContinue }: { onContinue: () => void }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const stashDetails = useStashQuoteDetails();
  const [companyName, setCompanyName] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const zipValid = /^\d{5}(-\d{4})?$/.test(zipCode.trim());
  const stateValid = /^[A-Za-z]{2}$/.test(state.trim());
  // Contact email validates only when filled, empty is fine since
  // contact info is optional and the prospect supplies it themselves
  // in the Accept modal.
  const emailValid =
    contactEmail.trim().length === 0 ||
    /^\S+@\S+\.\S+$/.test(contactEmail.trim());
  const canContinue =
    companyName.trim().length > 0 &&
    stateValid &&
    zipValid &&
    emailValid &&
    !stashDetails.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canContinue) return;
    stashDetails.mutate(
      {
        companyName: companyName.trim(),
        state: state.trim().toUpperCase(),
        zipCode: zipCode.trim(),
        contactName: contactName.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
      },
      {
        onSuccess: () => onContinue(),
        onError: (err: any) =>
          toast({
            title: "Couldn't save details",
            description: err?.message,
            variant: "destructive",
          }),
      },
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <ProposalNav />
      <div className="mx-auto max-w-xl px-6 py-12">
        <button
          type="button"
          onClick={() => navigate("/admin/quotes")}
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover-elevate rounded-md px-1.5 py-0.5"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to quotes
        </button>

        <div className="mb-6">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            <ShieldCheck className="h-3.5 w-3.5" />
            Step 1 of 2 · New quote
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-primary">
            Tell us about this prospect
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Just the company basics to get going. Contact info is optional -
            you can add it later, or the prospect fills it in when they
            accept the proposal.
          </p>
        </div>

        <Card className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Group / company name</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="companyName"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Holdings, LLC"
                  className="pl-9"
                  data-testid="input-quote-company"
                />
              </div>
            </div>

            <div className="grid grid-cols-[1fr_1.4fr] gap-3">
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Select value={state} onValueChange={setState}>
                  <SelectTrigger id="state" data-testid="input-quote-state">
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    {US_STATES.map((s) => (
                      <SelectItem key={s.code} value={s.code}>
                        {s.code}, {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="zipCode">ZIP code</Label>
                <Input
                  id="zipCode"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  placeholder="35243"
                  data-testid="input-quote-zip"
                />
              </div>
            </div>

            <div className="rounded-md border border-dashed border-border/70 p-4 space-y-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Contact <span className="font-normal normal-case tracking-normal text-muted-foreground/80">- optional, can be added later</span>
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactName">Contact name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="contactName"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Jane Smith"
                    className="pl-9"
                    data-testid="input-quote-contact-name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="contactEmail">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="contactEmail"
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="jane@acme.com"
                      className="pl-9"
                      data-testid="input-quote-contact-email"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactPhone">Phone</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="contactPhone"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      placeholder="(205) 555-0123"
                      className="pl-9"
                      data-testid="input-quote-contact-phone"
                    />
                  </div>
                </div>
              </div>
            </div>

            <Button
              type="submit"
              disabled={!canContinue}
              className="w-full gap-1.5"
              data-testid="button-quote-continue"
            >
              {stashDetails.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Continue to census upload
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-xs text-muted-foreground">
          Same rate engine, scoring, and accept flow as the customer-driven path.
          The prospect will only see the proposal, never this admin form.
        </p>
      </div>
    </div>
  );
}
