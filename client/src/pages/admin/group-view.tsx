import { Loader2 } from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useGroupForAdmin } from "@/hooks/use-admin";
import { ProposalCockpit } from "@/pages/proposal/cockpit";
import { ProposalNav } from "@/components/proposal/proposal-nav";
import { AdminBanner } from "@/components/admin/admin-banner";

// Admin's "view-as-customer" surface. Renders the exact cockpit a
// customer sees, with the AdminBanner overlaid on top for admin-only
// actions. The cockpit component itself has no admin awareness, it
// receives the group as a prop and the banner as a slot.
export default function AdminGroupViewPage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/admin/groups/:groupId");
  const groupId = params?.groupId;
  const { data: group, isLoading, isError } = useGroupForAdmin(groupId);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !group) {
    return (
      <div className="min-h-screen bg-background">
        <ProposalNav />
        <div className="mx-auto max-w-xl px-6 py-16">
          <Card className="p-8">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
              Group not found
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">
              We couldn't load that group
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The link may be out of date, or the group may have been deleted.
            </p>
            <Button className="mt-6" onClick={() => navigate("/admin")}>
              Back to users
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <ProposalCockpit
      group={group}
      bannerSlot={({ effectiveDate }) => <AdminBanner group={group} effectiveDate={effectiveDate} />}
      // Admin gets the same Replace Census path the customer does -
      // the server endpoint accepts owner-or-admin, so re-uploading
      // on behalf of a client works end-to-end. Accept-Proposal is
      // still a customer-driven flow, so we leave that prop omitted.
      onReplaceCensus={() => navigate(`/dashboard/${group.id}/replace-census`)}
    />
  );
}
