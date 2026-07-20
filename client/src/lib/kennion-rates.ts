// BenSync Benefits Program, static rates and rate-math helpers.
// Medical rates come from the server engine (/api/rate/price-group/:groupId).
// Dental, Vision, and Supplemental live in @shared/benefits-rates so the
// server PDF renderer can pull the exact same numbers. Re-exported here
// for the existing client call sites.

export {
  DENTAL_PLANS,
  VISION_PLANS,
  SUPPLEMENTAL,
} from "@shared/benefits-rates";
export type {
  TierKey,
  TieredRates,
  SimplePlan,
  AgeBand,
  SupplementalSection,
} from "@shared/benefits-rates";
import type { TieredRates } from "@shared/benefits-rates";

export type TierMix = Record<"EE" | "EE_CH" | "EE_SP" | "EE_FAM", number>;

export type MedicalPlan = {
  id: string;
  name: string;
  tier?: string;
  note?: string;
  base: TieredRates;
};

// Effective dates: always 30+ days out, aligned to 1st of month, 3 options.
export function effectiveDateOptions(baseDate: Date = new Date()): Date[] {
  const earliest = new Date(baseDate);
  earliest.setDate(earliest.getDate() + 30);
  const d = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
  if (earliest.getDate() > 1) d.setMonth(d.getMonth() + 1);
  const out: Date[] = [];
  for (let i = 0; i < 3; i++) {
    out.push(new Date(d));
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const money = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const money0 = (n: number) =>
  "$" + Math.round(n).toLocaleString("en-US");

export const fmtMonthYear = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", year: "numeric" });

export const fmtMonthYearLong = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "long", year: "numeric" });

export const fmtLong = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

// Deterministic, human-readable census filename. Uses the most recent
// roster activity (updatedAt ?? submittedAt) so successive edits/uploads
// produce unique filenames when downloaded.
//
// Example: ridgeline_coffee_roasters_20260422_1845.csv
export function censusFileName(group: {
  companyName: string;
  updatedAt?: Date | string | null;
  submittedAt?: Date | string | null;
}) {
  const stamp = group.updatedAt ?? group.submittedAt ?? null;
  const d = stamp instanceof Date ? stamp : stamp ? new Date(stamp) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const slug = (group.companyName || "census")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${slug}_${date}_${time}.csv`;
}

// Monthly total math for a medical plan + group mix.
// Mix keys: EE, EE_CH, EE_SP, EE_FAM (counts of employees in each tier).
// contribValue is the employer's Defined Contribution in $ per employee
// per month, clamped to the EE-only rate.
export function computeMedicalTotal(
  plan: Pick<MedicalPlan, "base">,
  mix: TierMix,
  contribValue: number,
) {
  const rate = (t: TierKey) => plan.base[t];
  const employees = mix.EE + mix.EE_CH + mix.EE_SP + mix.EE_FAM;
  const gross =
    mix.EE * rate("EE") +
    mix.EE_CH * rate("EE_CH") +
    mix.EE_SP * rate("EE_SP") +
    mix.EE_FAM * rate("EE_FAM");
  const erPerEE = Math.min(contribValue, rate("EE"));
  const employerCost = erPerEE * employees;
  const employeeCost = gross - employerCost;
  return { gross, employerCost, employeeCost };
}
