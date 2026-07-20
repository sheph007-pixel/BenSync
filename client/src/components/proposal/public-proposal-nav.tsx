import { KennionLogo } from "@/components/kennion-logo";
import { ThemeToggle } from "@/components/theme-toggle";

// Logged-out replacement for ProposalNav, used by the /q/:token public
// share-link cockpit. No useMyGroups (would 401), no profile menu, no
// admin chrome, just the brand and the theme toggle. Visiting the
// logo link drops the prospect on the public landing page.
export function PublicProposalNav() {
  return (
    <nav className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-6 py-3">
        <KennionLogo size="md" linkTo="/" />
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Proposal prepared by BenSync
          </span>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
