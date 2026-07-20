import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useMyGroups, useGroupById } from "@/hooks/use-proposal";
import { useAuth } from "@/lib/auth";
import { ProposalCockpit } from "@/pages/proposal/cockpit";
import { ProposalUpload } from "@/pages/proposal/upload";
import { ProposalAnalyzing } from "@/pages/proposal/analyzing";
import { ProposalHighRisk } from "@/pages/proposal/high-risk";
import { NewGroupDetails } from "@/pages/proposal/new-group";
import { ProposalNav } from "@/components/proposal/proposal-nav";
import { HunterContactButton } from "@/components/contact/hunter-contact-button";

// URL-driven screen router. The URL + server group state are the single
// source of truth, no local "screen" state, so refresh, back/forward,
// and link-sharing all land in the right place.
//
//   /dashboard          → if no groups, upload. else redirect to most recent.
//   /dashboard/new      → upload a new group, regardless of existing groups.
//   /dashboard/:id      → cockpit / analyzing / high-risk for that group.
//
// The Accept flow is no longer URL-driven, it's a modal mounted inside
// the cockpit. See ProposalAcceptModal.
export default function DashboardPage() {
  const [, navigate] = useLocation();
  const [isNewRoute] = useRoute("/dashboard/new");
  const [isGroupRoute, params] = useRoute("/dashboard/:groupId");
  const groupId = isGroupRoute ? params?.groupId : undefined;

  const { groups, isLoading } = useMyGroups();
  const { group: selectedGroup } = useGroupById(groupId);
  const { user } = useAuth();
  // Group-side only. Admins viewing a customer's dashboard have their
  // own tools and shouldn't see the customer-facing contact button.
  const showContact = user?.role !== "admin";

  // /dashboard with groups → redirect to the most recent.
  const needsIndexRedirect = !isNewRoute && !isGroupRoute && !isLoading && groups.length > 0;
  useEffect(() => {
    if (needsIndexRedirect) {
      navigate(`/dashboard/${groups[0].id}`, { replace: true });
    }
  }, [needsIndexRedirect, groups, navigate]);

  const content = (() => {
    if (isLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    // Explicit "upload a new group" path. If the user already has at
    // least one group, they first fill in the new group's name, state,
    // and ZIP, we only skip that form for the initial group, which
    // inherits the details they entered at signup.
    if (isNewRoute) {
      return <NewGroupUploadFlow hasExistingGroups={groups.length > 0} />;
    }

    // No groups yet → upload is the landing screen. Same behavior as before
    // the multi-group change.
    if (groups.length === 0) {
      return (
        <ProposalUpload
          onComplete={(g) => navigate(`/dashboard/${g.id}`, { replace: true })}
        />
      );
    }

    // /dashboard bare URL with groups in flight → the effect above redirects
    // us on the next tick; render a spinner until it happens.
    if (!isGroupRoute) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    // /dashboard/:id where :id isn't one of the user's groups.
    if (!selectedGroup) {
      return <NotFoundState onBack={() => navigate("/dashboard/groups")} />;
    }

    // Still running the initial analysis, the group exists but hasn't been
    // scored yet. We show the animated progress screen; when the server
    // sets riskTier, useMyGroups re-fetches and we fall through to the
    // proper view.
    if (!selectedGroup.riskTier) {
      return (
        <ProposalAnalyzing
          group={selectedGroup}
          onComplete={() => {
            // Stay on the same URL, the group record will have a tier
            // now, so the next render will pick cockpit or high-risk.
          }}
        />
      );
    }

    // High risk groups never see the proposal.
    if (selectedGroup.riskTier === "high") {
      return <ProposalHighRisk />;
    }

    return (
      <ProposalCockpit
        group={selectedGroup}
        onReplaceCensus={() => navigate(`/dashboard/${selectedGroup.id}/replace-census`)}
      />
    );
  })();

  return (
    <>
      {content}
      {showContact && <HunterContactButton />}
    </>
  );
}

// Small 2-step flow wrapped into the /dashboard/new route: first the
// group identity form (skipped on very first upload), then the census
// upload. Once upload completes we route to /dashboard/:newId and the
// parent dashboard takes over.
function NewGroupUploadFlow({ hasExistingGroups }: { hasExistingGroups: boolean }) {
  const [, navigate] = useLocation();
  const [detailsDone, setDetailsDone] = useState(!hasExistingGroups);

  if (!detailsDone) {
    return <NewGroupDetails onContinue={() => setDetailsDone(true)} />;
  }

  return (
    <ProposalUpload
      onComplete={(g) => navigate(`/dashboard/${g.id}`, { replace: true })}
    />
  );
}

function NotFoundState({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-background">
      <ProposalNav />
      <div className="mx-auto max-w-xl px-6 py-16">
        <Card className="p-8">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            Group not found
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">
            We couldn't find that quote
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            The link may be out of date, or the quote may have been removed.
            Head back to your groups to continue.
          </p>
          <Button className="mt-6" onClick={onBack}>
            Back to your groups
          </Button>
        </Card>
      </div>
    </div>
  );
}
