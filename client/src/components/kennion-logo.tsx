import { Link } from "wouter";

// BenSync wordmark, matching the marketing site brand: "Ben" in navy,
// "Sync" in green. Rendered as text so no remote asset is needed; swap in
// an SVG logo here later if one is produced. File keeps its historical
// name so the five importers stay untouched.
interface KennionLogoProps {
  size?: "sm" | "md" | "lg";
  linkTo?: string;
}

const SIZES: Record<NonNullable<KennionLogoProps["size"]>, string> = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-3xl",
};

export function KennionLogo({ size = "md", linkTo = "/" }: KennionLogoProps) {
  const content = (
    <span
      className={`${SIZES[size]} font-semibold tracking-tight cursor-pointer select-none`}
      data-testid="logo-bensync"
    >
      <span className="text-[#0F2A47] dark:text-white">Ben</span>
      <span className="text-[#1F8A5B]">Sync</span>
    </span>
  );

  if (linkTo) {
    return <Link href={linkTo}>{content}</Link>;
  }

  return content;
}
