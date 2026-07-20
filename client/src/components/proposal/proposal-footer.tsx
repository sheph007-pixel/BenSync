import { ExternalLink, Lock } from "lucide-react";

// Thin footer used on every customer proposal screen. Surfaces the
// "Program details" link (moved out of the top nav) plus the SOC 2
// reassurance line.
export function ProposalFooter() {
  return (
    <footer className="mt-16 border-t bg-background/60">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-6 py-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Lock className="h-3.5 w-3.5" />
          <span>SOC 2 Type II · Encrypted in transit and at rest</span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="https://bensync.com"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 font-medium hover:text-foreground"
            data-testid="link-program-details"
          >
            Program details
            <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href="mailto:hunter@kennion.com"
            className="font-medium hover:text-foreground"
            data-testid="link-support"
          >
            Support
          </a>
          <span>© {new Date().getFullYear()} BenSync</span>
        </div>
      </div>
    </footer>
  );
}
