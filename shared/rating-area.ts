// Rating-area inference shared by server (rate engine) and client
// (proposal UI). Kept in shared/ so there is exactly one source of
// truth for how state + ZIP map to an actuarial rating area.
//
// These five areas are the authoritative list, see
// `server/factor-tables.json` Area Rating Factors. Do not rename
// without updating the rater workbook and the sync script.

export type RatingArea =
  | "Birmingham"
  | "Huntsville"
  | "Montgomery"
  | "Alabama Other Area"
  | "Out-of-State"
  | "auto";

export function inferRatingArea(
  state?: string | null,
  zip?: string | null,
): RatingArea {
  const st = (state || "").trim().toUpperCase();
  const z = (zip || "").trim().slice(0, 3);
  if (st && st !== "AL") return "Out-of-State";
  const z3 = parseInt(z, 10);
  if (!st && (isNaN(z3) || z3 < 350 || z3 > 369)) return "Out-of-State";
  if (["350", "351", "352"].includes(z)) return "Birmingham";
  if (["358", "359"].includes(z)) return "Huntsville";
  if (["360", "361"].includes(z)) return "Montgomery";
  return "Alabama Other Area";
}
