import {
  Clock,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  XCircle,
  ThumbsUp,
  type LucideIcon,
} from "lucide-react";

export type StatusValue =
  | "census_uploaded"
  | "approved"
  | "proposal_sent"
  | "proposal_accepted"
  | "client"
  | "not_approved";

export type RiskTier = "preferred" | "standard" | "high";

export const STATUS_OPTIONS: ReadonlyArray<{
  value: StatusValue;
  label: string;
  icon: LucideIcon;
}> = [
  { value: "census_uploaded", label: "Census Uploaded", icon: Clock },
  { value: "approved", label: "Approved", icon: ThumbsUp },
  { value: "proposal_sent", label: "Proposal Sent", icon: AlertCircle },
  { value: "proposal_accepted", label: "Proposal Accepted", icon: CheckCircle2 },
  { value: "client", label: "Client", icon: TrendingUp },
  { value: "not_approved", label: "Not Approved", icon: XCircle },
];

export const STATUS_COLORS: Record<StatusValue, string> = {
  census_uploaded: "text-blue-700 dark:text-blue-400",
  approved: "text-emerald-700 dark:text-emerald-400",
  proposal_sent: "text-purple-700 dark:text-purple-400",
  proposal_accepted: "text-green-700 dark:text-green-400",
  client: "text-green-700 dark:text-green-400",
  not_approved: "text-red-700 dark:text-red-400",
};

export const STATUS_BG: Record<StatusValue, string> = {
  census_uploaded: "bg-blue-500/10",
  approved: "bg-emerald-500/10",
  proposal_sent: "bg-purple-500/10",
  proposal_accepted: "bg-green-500/10",
  client: "bg-green-500/10",
  not_approved: "bg-red-500/10",
};

// Tier → color mapping locked in by spec: preferred=green-700,
// standard=blue-700, high=red-700. Applied everywhere riskScore/riskTier
// is displayed (overview stat card, risk gauge, detail-page tier badge,
// groups-list aggregate rows).
export const TIER_CONFIG: Record<
  RiskTier,
  { label: string; className: string; hsl: string }
> = {
  preferred: {
    label: "Preferred Risk",
    className: "text-green-700 dark:text-green-400",
    hsl: "hsl(145 70% 30%)",
  },
  standard: {
    label: "Standard Risk",
    className: "text-blue-700 dark:text-blue-400",
    hsl: "hsl(210 85% 30%)",
  },
  high: {
    label: "High Risk",
    className: "text-red-700 dark:text-red-400",
    hsl: "hsl(0 72% 42%)",
  },
};

export function statusLabel(status: string): string {
  return (
    STATUS_OPTIONS.find((s) => s.value === status)?.label ??
    status.replace(/_/g, " ")
  );
}

export function tierConfig(tier: string | null | undefined) {
  if (tier && (tier === "preferred" || tier === "standard" || tier === "high")) {
    return TIER_CONFIG[tier];
  }
  return null;
}
