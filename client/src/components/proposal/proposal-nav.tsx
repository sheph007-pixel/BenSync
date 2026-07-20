import { useState } from "react";
import { ChevronDown, LogOut, Plus, UserCog, Users } from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { KennionLogo } from "@/components/kennion-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { useMyGroups } from "@/hooks/use-proposal";
import { TIER_CONFIG, type RiskTier } from "@/pages/admin/constants";
import { ProfileDialog } from "./profile-dialog";

// Single nav used across every customer proposal screen, upload,
// analyzing, cockpit, accept, high-risk, groups gallery. Logo sits
// alone on the left; everything else lives in one consolidated menu
// on the right: current group context (as a subtitle), group actions
// (switch / new), profile, log out. Customer and admin screens share
// this nav; group-related menu items are hidden on /admin routes.
export function ProposalNav() {
  const { user, logout } = useAuth();
  const [location, navigate] = useLocation();
  const [, groupParams] = useRoute("/dashboard/:groupId");
  const [profileOpen, setProfileOpen] = useState(false);
  const { groups } = useMyGroups();
  const initial = (user?.fullName || user?.email || "?").trim().charAt(0).toUpperCase();

  const isAdmin = location.startsWith("/admin");

  // Active group is derived from the URL, the subtitle in the profile
  // chip tracks what the user is actually looking at.
  const activeId = groupParams?.groupId;
  const activeGroup = activeId ? groups.find((g) => g.id === activeId) ?? null : null;
  const activeTier = activeGroup?.riskTier as RiskTier | null | undefined;
  const activeTierConfig = activeTier && TIER_CONFIG[activeTier];

  const subtitle =
    activeGroup?.companyName || user?.companyName || user?.email || "";

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  return (
    <>
      <nav className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-6 py-3">
          <KennionLogo
            size="md"
            linkTo={user?.role === "admin" ? "/admin" : "/dashboard"}
          />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-2.5 rounded-md px-2 py-1 hover-elevate"
                    data-testid="button-profile-menu"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {initial}
                    </div>
                    <div className="hidden flex-col items-start leading-tight sm:flex">
                      <span className="text-sm font-semibold">{user.fullName || "Account"}</span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {activeTierConfig && (
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: activeTierConfig.hsl }}
                            aria-hidden
                          />
                        )}
                        <span className="max-w-[160px] truncate">{subtitle}</span>
                      </span>
                    </div>
                    <ChevronDown className="hidden h-4 w-4 text-muted-foreground sm:block" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    Signed in as
                    <div className="mt-0.5 font-semibold text-foreground">{user.email}</div>
                  </div>

                  {!isAdmin && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        Groups
                      </DropdownMenuLabel>
                      {groups.length > 0 && (
                        <DropdownMenuItem
                          onSelect={() => navigate("/dashboard/groups")}
                          data-testid="menu-your-groups"
                        >
                          <Users className="mr-2 h-4 w-4" />
                          <span>Your groups</span>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {groups.length}
                          </span>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onSelect={() => navigate("/dashboard/new")}
                        data-testid="menu-new-group"
                      >
                        <Plus className="mr-2 h-4 w-4 text-primary" />
                        <span className="font-semibold text-primary">New group</span>
                      </DropdownMenuItem>
                    </>
                  )}

                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setProfileOpen(true)} data-testid="menu-edit-profile">
                    <UserCog className="mr-2 h-4 w-4" />
                    Edit profile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={handleLogout} data-testid="menu-logout">
                    <LogOut className="mr-2 h-4 w-4" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </nav>
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
}
