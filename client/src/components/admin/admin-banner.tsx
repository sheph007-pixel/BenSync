import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  Briefcase,
  ChevronDown,
  Copy,
  Eye,
  MoreHorizontal,
  RotateCcw,
  ShieldCheck,
  Slash,
  Trash2,
  UserCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAllUsers } from "@/hooks/use-admin";
import {
  useRotateQuoteLink,
  useRevokeQuoteLink,
  deriveQuoteStatus,
  statusLabel,
} from "@/hooks/use-admin-quotes";
import { EditUserDialog } from "./edit-user-dialog";
import { RiskScreenButton } from "./risk-screen-button";
import type { Group } from "@shared/schema";

type Props = {
  group: Group;
  // Effective date currently selected on the Proposal cockpit. Passed
  // down to the Risk Screen so funding numbers match the cockpit rates.
  effectiveDate?: Date | string;
};

// Pinned below the top nav when an admin views a customer group. Shows
// who they're viewing and keeps the essential admin actions (Edit user,
// Delete group) tucked into an overflow menu so the bar stays quiet
// above the cockpit. Primary workflow actions (approve, status,
// generate proposal) were removed per product direction, add back
// here if needed.
export function AdminBanner({ group, effectiveDate }: Props) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { data: users } = useAllUsers();
  const owner = group.userId ? users?.find((u) => u.id === group.userId) : null;
  const isInternalSales = group.source === "internal_sales";

  const [editUserOpen, setEditUserOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const rotate = useRotateQuoteLink();
  const revoke = useRevokeQuoteLink();

  const deleteGroup = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/groups/${group.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quotes"] });
      toast({ title: isInternalSales ? "Quote deleted" : "Group deleted" });
      navigate(isInternalSales ? "/admin/quotes" : "/admin");
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const publicUrl = group.publicToken
    ? `${window.location.origin}/q/${group.publicToken}`
    : null;
  function copyLink() {
    if (!publicUrl) return;
    navigator.clipboard
      .writeText(publicUrl)
      .then(() => toast({ title: "Link copied" }))
      .catch(() => toast({ title: "Copy failed", variant: "destructive" }));
  }

  return (
    <>
      <div className="border-b border-primary/20 bg-primary/5">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-3 px-6 py-2.5">
          <button
            type="button"
            onClick={() => navigate(isInternalSales ? "/admin/quotes" : "/admin")}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover-elevate rounded-md px-1.5 py-0.5"
            data-testid="button-admin-back"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {isInternalSales ? "All quotes" : "All users"}
          </button>
          <span aria-hidden className="text-muted-foreground">·</span>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            {isInternalSales ? (
              <>
                <Briefcase className="h-3.5 w-3.5" />
                Internal Sales Quote
              </>
            ) : (
              <>
                <ShieldCheck className="h-3.5 w-3.5" />
                Admin view
              </>
            )}
          </div>
          {owner ? (
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{owner.fullName}</span>
              <span className="mx-1.5" aria-hidden>·</span>
              <a href={`mailto:${owner.email}`} className="hover:text-foreground">
                {owner.email}
              </a>
            </div>
          ) : isInternalSales ? (
            <div className="text-xs text-muted-foreground">
              {group.contactName || group.contactEmail ? (
                <>
                  {group.contactName && (
                    <span className="font-semibold text-foreground">{group.contactName}</span>
                  )}
                  {group.contactName && group.contactEmail && (
                    <span className="mx-1.5" aria-hidden>·</span>
                  )}
                  {group.contactEmail && (
                    <a href={`mailto:${group.contactEmail}`} className="hover:text-foreground">
                      {group.contactEmail}
                    </a>
                  )}
                </>
              ) : (
                <span className="italic">Contact info not set, prospect fills it on Accept</span>
              )}
            </div>
          ) : null}
          <div className="flex-1" />

          <RiskScreenButton groupId={group.id} effectiveDate={effectiveDate} />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="px-2" data-testid="button-admin-more">
                <MoreHorizontal className="h-4 w-4" />
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!isInternalSales && (
                <DropdownMenuItem onSelect={() => setEditUserOpen(true)} disabled={!owner}>
                  <UserCog className="mr-2 h-4 w-4" />
                  Edit user
                </DropdownMenuItem>
              )}
              {!isInternalSales && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onSelect={() => setConfirmDelete(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {isInternalSales ? "Delete quote" : "Delete group"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {isInternalSales && group.riskTier && (
          <div className="border-t border-primary/10 bg-background/60">
            <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-3 px-6 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Public link
              </span>
              {publicUrl ? (
                <code
                  className="min-w-0 flex-1 truncate rounded border bg-card px-2 py-1 text-xs font-mono"
                  data-testid="text-public-quote-url"
                  title={publicUrl}
                >
                  {publicUrl}
                </code>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Revoked, rotate to mint a fresh link.
                </span>
              )}
              <span className="text-[11px] text-muted-foreground">
                {statusLabel(deriveQuoteStatus(group))}
                {group.viewCount ? ` · ${group.viewCount} views` : null}
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                {publicUrl && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={copyLink}
                      className="gap-1.5"
                      data-testid="button-banner-copy-link"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(publicUrl, "_blank")}
                      className="gap-1.5"
                      data-testid="button-banner-preview"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Preview
                    </Button>
                  </>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    rotate.mutate(group.id, {
                      onSuccess: () => toast({ title: "Link rotated" }),
                      onError: (e: any) => toast({ title: "Rotate failed", description: e?.message, variant: "destructive" }),
                    })
                  }
                  disabled={rotate.isPending}
                  className="gap-1.5"
                  data-testid="button-banner-rotate"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {publicUrl ? "Rotate" : "New link"}
                </Button>
                {publicUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmRevoke(true)}
                    className="gap-1.5 text-destructive hover:text-destructive"
                    data-testid="button-banner-revoke"
                  >
                    <Slash className="h-3.5 w-3.5" />
                    Revoke
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <EditUserDialog
        user={owner ?? null}
        open={editUserOpen}
        onOpenChange={setEditUserOpen}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isInternalSales ? "Delete this quote?" : "Delete this group?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isInternalSales
                ? `Removes the census, scoring, and public link for ${group.companyName}. Cannot be undone.`
                : `Removes the census, proposals, and all scoring data for ${group.companyName}. The user's account is not affected.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteGroup.mutate()}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRevoke} onOpenChange={setConfirmRevoke}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke the public link?</AlertDialogTitle>
            <AlertDialogDescription>
              The current /q/… URL stops working. You can mint a fresh one with Rotate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                revoke.mutate(group.id, {
                  onSuccess: () => {
                    toast({ title: "Link revoked" });
                    setConfirmRevoke(false);
                  },
                  onError: (e: any) =>
                    toast({ title: "Revoke failed", description: e?.message, variant: "destructive" }),
                })
              }
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
