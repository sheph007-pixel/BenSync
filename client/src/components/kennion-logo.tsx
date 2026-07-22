import { Link } from "wouter";

// BenSync wordmark, using the official logo files served from /brand
// (see /brand for the full asset kit). The color version shows on light
// backgrounds and the reversed (white + mint) version in dark mode, per
// the brand usage rules. File keeps its historical name so the five
// importers stay untouched.
interface KennionLogoProps {
  size?: "sm" | "md" | "lg";
  linkTo?: string;
}

const SIZES: Record<NonNullable<KennionLogoProps["size"]>, string> = {
  sm: "h-[18px]",
  md: "h-6",
  lg: "h-[30px]",
};

export function KennionLogo({ size = "md", linkTo = "/" }: KennionLogoProps) {
  const content = (
    <span className="inline-flex cursor-pointer select-none" data-testid="logo-bensync">
      <img
        src="/brand/wordmark-header.png"
        alt="BenSync"
        className={`${SIZES[size]} w-auto dark:hidden`}
      />
      <img
        src="/brand/wordmark-header-reversed.png"
        alt="BenSync"
        className={`${SIZES[size]} w-auto hidden dark:block`}
      />
    </span>
  );

  if (linkTo) {
    return <Link href={linkTo}>{content}</Link>;
  }

  return content;
}
