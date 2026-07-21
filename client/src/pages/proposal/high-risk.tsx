import { Card } from "@/components/ui/card";
import { ClickToRevealPhone } from "@/components/click-to-reveal-phone";
import { ProposalNav } from "@/components/proposal/proposal-nav";
import { ProposalFooter } from "@/components/proposal/proposal-footer";
import { Mail, Phone } from "lucide-react";
import { useAuth } from "@/lib/auth";

export function ProposalHighRisk() {
  const { user } = useAuth();
  const firstName = user?.fullName?.split(" ")[0] || "there";
  return (
    <div className="min-h-screen bg-background">
      <ProposalNav />
      <div className="mx-auto max-w-xl px-6 py-16">
        <Card className="p-8">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            Thanks for submitting, {firstName}
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">
            Your advisor will reach out directly
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            We've received your census and are reviewing it. Because your group has a unique
            profile, we want to hand-pair you with a BenSync advisor who can walk through options
            that fit you specifically, rather than auto-generate a proposal. Expect a call or email
            within 1 business day.
          </p>

          <div className="mt-6 space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" />
              <ClickToRevealPhone label="Click to reveal direct line" variant="link" />
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              <a href="mailto:support@bensync.com" className="font-semibold text-primary hover:underline">
                support@bensync.com
              </a>
            </div>
          </div>
        </Card>
      </div>
      <ProposalFooter />
    </div>
  );
}
