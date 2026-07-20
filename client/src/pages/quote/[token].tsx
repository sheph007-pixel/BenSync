import { Loader2 } from "lucide-react";
import { useRoute } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProposalCockpit } from "@/pages/proposal/cockpit";
import { PublicProposalNav } from "@/components/proposal/public-proposal-nav";
import { usePublicQuote } from "@/hooks/use-public-quote";
import type { Group } from "@shared/schema";

// Public share link surface. Logged-out, token-gated, no PHI.
// Renders the same ProposalCockpit a customer sees but in
// mode={"public"}: no replace-census, no view-census, no rename, no
// score audit, and the accept modal posts to the token-gated
// endpoint instead of the session route.
export default function PublicQuotePage() {
  const [, params] = useRoute("/q/:token");
  const token = params?.token;
  const { data, isLoading, isError, error } = usePublicQuote(token);

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
              {error instanceof Error && /not\s*found|404/i.test(error.message)
                ? "The link may have been revoked or it's still being prepared. Reach out to your BenSync advisor for a fresh link."
                : "Something went wrong loading this proposal. Please try refreshing, or reach out to your BenSync advisor."}
            </p>
            <Button
              className="mt-6"
              onClick={() => {
                window.location.href = "mailto:hunter@kennion.com";
              }}
            >
              Email Hunter Shepherd
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  // The server hands back a sanitised group object that has the same
  // shape the cockpit needs (omitted FK ids etc.); cast for the prop.
  const group = data.group as Group;

  return (
    <ProposalCockpit
      group={group}
      mode={{ kind: "public", token: token!, mix: data.mix }}
      nav={<PublicProposalNav />}
      acceptUrl={`/api/quote/${token}/accept`}
    />
  );
}
