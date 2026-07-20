import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProposalNav } from "@/components/proposal/proposal-nav";
import { ProposalUpload } from "@/pages/proposal/upload";
import type { Group } from "@shared/schema";

// Replace-census page. Thin wrapper that resolves the group from the
// URL and renders ProposalUpload in replace mode. ProposalUpload does
// all the heavy lifting, AI column mapping, validation preview,
// cache invalidations. On success we navigate back to the cockpit so
// the user sees the new tier / score / rates.
//
// We fetch via /api/groups/:id (which has an admin-or-owner bypass
// server-side) rather than useGroupById/useMyGroups so admin
// impersonation works too, admin viewing a customer's group isn't
// in their own groups list.
export default function ReplaceCensusPage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/dashboard/:groupId/replace-census");
  const groupId = params?.groupId;

  const { data: group, isLoading, isError } = useQuery<Group>({
    queryKey: ["/api/groups", groupId],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${groupId}`, { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? `Failed to load group (${res.status})`);
      }
      return res.json();
    },
    enabled: Boolean(groupId),
  });

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
              We couldn't find that quote
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The link may be out of date, or the quote may have been removed.
            </p>
            <Button className="mt-6" onClick={() => navigate("/dashboard/groups")}>
              Back to your groups
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <ProposalUpload
      replaceForGroupId={group.id}
      onComplete={() => navigate(`/dashboard/${group.id}`, { replace: true })}
    />
  );
}
