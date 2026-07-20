/**
 * Kennion block-calibrated demographic risk factors.
 *
 * Per (age band × gender) risk multiplier, normalized so 1.00 = book median.
 * Trained on Kennion's MEDICAL DATA + PHARMACY DATA paid claims (model risk-v2).
 *
 * This is the SAME table the legacy /api/admin/groups/:id/analyze endpoint
 * uses. It's the demographic foundation of both the legacy BenSync Score
 * and the new KUI / Risk Screen (KRS).
 */
export const DEMOGRAPHIC_RISK_TABLE: Record<string, { female: number; male: number }> = {
  "0-4":      { female: 0.35,  male: 0.40 },
  "5-9":      { female: 0.30,  male: 0.55 },
  "10-14":    { female: 0.37,  male: 0.46 },
  "15-19":    { female: 0.62,  male: 0.46 },
  "20-24":    { female: 0.80,  male: 0.46 },
  "25-29":    { female: 0.92,  male: 0.46 },
  "30-34":    { female: 0.88,  male: 0.45 },
  "35-39":    { female: 0.81,  male: 0.52 },
  "40-44":    { female: 1.18,  male: 0.77 },
  "45-49":    { female: 1.03,  male: 0.67 },
  "50-54":    { female: 1.43,  male: 1.20 },
  "55-59":    { female: 1.22,  male: 1.52 },
  "60-64":    { female: 1.49,  male: 1.99 },
  "65-69":    { female: 3.81,  male: 1.64 },
  "70-Above": { female: 10.36, male: 2.78 },
};

export function legacyAgeBand(age: number): string {
  if (age < 5)  return "0-4";
  if (age < 10) return "5-9";
  if (age < 15) return "10-14";
  if (age < 20) return "15-19";
  if (age < 25) return "20-24";
  if (age < 30) return "25-29";
  if (age < 35) return "30-34";
  if (age < 40) return "35-39";
  if (age < 45) return "40-44";
  if (age < 50) return "45-49";
  if (age < 55) return "50-54";
  if (age < 60) return "55-59";
  if (age < 65) return "60-64";
  if (age < 70) return "65-69";
  return "70-Above";
}

export function blockDemographicRisk(age: number, gender: string | null | undefined): number {
  const band = legacyAgeBand(age);
  const row = DEMOGRAPHIC_RISK_TABLE[band];
  if (!row) return 1.0;
  const g = (gender || "").trim().toLowerCase();
  const isFemale = g === "female" || g === "f";
  return isFemale ? row.female : row.male;
}
