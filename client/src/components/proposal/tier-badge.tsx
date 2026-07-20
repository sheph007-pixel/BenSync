import { TIER_CONFIG, type RiskTier } from "@/pages/admin/constants";
import { cn } from "@/lib/utils";

type Props = {
  tier: RiskTier | null | undefined;
  className?: string;
};

// Small eyebrow above the group name. High-risk groups read "Not
// Approved" (the group is ineligible for a proposal); every other
// tier reads "Approved · <tier label>".
export function TierBadge({ tier, className }: Props) {
  if (!tier || !TIER_CONFIG[tier]) return null;
  const config = TIER_CONFIG[tier];
  const label = tier === "high" ? "Not Approved" : `Approved · ${config.label}`;
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]",
        config.className,
        className,
      )}
      data-testid="badge-tier"
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: config.hsl, boxShadow: `0 0 0 4px ${config.hsl}22` }}
        aria-hidden
      />
      <span>{label}</span>
    </div>
  );
}
