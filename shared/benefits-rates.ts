// Static (non-medical) benefit rates shared by the client UI and the
// server PDF renderer. Kept here so both surfaces render the exact
// same numbers, previously the client held these as canonical data,
// which meant the server couldn't include them in the downloaded PDF.
//
// Medical rates come from the Drizzle-of-record `rate-engine.ts` and
// are NOT in this file.

export type TierKey = "EE" | "EE_CH" | "EE_SP" | "EE_FAM";

export type TieredRates = Record<TierKey, number>;

export type SimplePlan = {
  id: string;
  name: string;
  rates: TieredRates;
};

export const DENTAL_PLANS: SimplePlan[] = [
  { id: "advantage-ortho", name: "Advantage Dental (W Ortho)", rates: { EE: 52.52, EE_CH: 93.03, EE_SP: 81.63, EE_FAM: 123.14 } },
  { id: "complete-ortho", name: "Complete Dental (W Ortho)", rates: { EE: 45.66, EE_CH: 80.89, EE_SP: 70.97, EE_FAM: 107.09 } },
  { id: "value-ortho", name: "Value Dental (W Ortho)", rates: { EE: 40.88, EE_CH: 77.75, EE_SP: 68.00, EE_FAM: 103.53 } },
  { id: "complete", name: "Complete Dental", rates: { EE: 41.67, EE_CH: 65.34, EE_SP: 57.63, EE_FAM: 87.01 } },
  { id: "value", name: "Value Dental", rates: { EE: 36.87, EE_CH: 59.93, EE_SP: 52.49, EE_FAM: 79.65 } },
  { id: "basic", name: "Basic Dental", rates: { EE: 29.36, EE_CH: 55.83, EE_SP: 48.81, EE_FAM: 74.34 } },
  { id: "choice", name: "Choice Dental", rates: { EE: 20.43, EE_CH: 38.86, EE_SP: 33.98, EE_FAM: 51.73 } },
];

export const VISION_PLANS: SimplePlan[] = [
  { id: "premium", name: "Premium Vision", rates: { EE: 8.71, EE_CH: 18.65, EE_SP: 17.42, EE_FAM: 29.80 } },
  { id: "standard", name: "Standard Vision", rates: { EE: 7.69, EE_CH: 16.46, EE_SP: 15.40, EE_FAM: 26.32 } },
  { id: "value", name: "Value Vision", rates: { EE: 7.34, EE_CH: 15.70, EE_SP: 14.69, EE_FAM: 25.11 } },
  { id: "base", name: "Base Vision", rates: { EE: 3.62, EE_CH: 7.75, EE_SP: 7.24, EE_FAM: 12.38 } },
];

export type AgeBand = { label: string; rates: Partial<TieredRates> };

export type SupplementalSection =
  | { kind: "bands"; label: string; note?: string; bands: AgeBand[] }
  | { kind: "flat"; label: string; note?: string; rates: TieredRates }
  | { kind: "plans"; label: string; note?: string; plans: { label: string; rates: TieredRates }[] };

export const SUPPLEMENTAL: Record<string, SupplementalSection> = {
  life_add: {
    kind: "bands",
    label: "Voluntary Life/AD&D Insurance",
    note: "Life $100K EE / $50K Spouse / $10K Child(ren)",
    bands: [
      { label: "Under Age 30", rates: { EE: 10.20, EE_CH: 12.00, EE_SP: 15.30, EE_FAM: 17.10 } },
      { label: "Age 30 to 34", rates: { EE: 11.50, EE_CH: 13.30, EE_SP: 17.25, EE_FAM: 19.05 } },
      { label: "Age 35 to 39", rates: { EE: 14.10, EE_CH: 15.90, EE_SP: 21.15, EE_FAM: 22.95 } },
      { label: "Age 40 to 44", rates: { EE: 17.30, EE_CH: 19.10, EE_SP: 25.95, EE_FAM: 27.75 } },
      { label: "Age 45 to 49", rates: { EE: 25.80, EE_CH: 27.60, EE_SP: 38.70, EE_FAM: 40.50 } },
      { label: "Age 50 to 54", rates: { EE: 41.20, EE_CH: 43.00, EE_SP: 61.80, EE_FAM: 63.60 } },
      { label: "Age 55 to 59", rates: { EE: 58.90, EE_CH: 60.70, EE_SP: 88.35, EE_FAM: 90.15 } },
    ],
  },
  accident: {
    kind: "flat",
    label: "Accident Insurance",
    rates: { EE: 13.41, EE_CH: 23.34, EE_SP: 20.66, EE_FAM: 30.59 },
  },
  critical: {
    kind: "bands",
    label: "Critical Illness Insurance",
    note: "$10K EE / $5K Spouse / $2.5K Child(ren)",
    bands: [
      { label: "Under Age 30", rates: { EE: 4.40, EE_CH: 4.40, EE_SP: 6.60, EE_FAM: 6.60 } },
      { label: "Age 30 to 39", rates: { EE: 6.30, EE_CH: 6.30, EE_SP: 9.45, EE_FAM: 9.45 } },
      { label: "Age 40 to 49", rates: { EE: 12.40, EE_CH: 12.40, EE_SP: 18.60, EE_FAM: 18.60 } },
      { label: "Age 50 to 59", rates: { EE: 23.50, EE_CH: 23.50, EE_SP: 35.25, EE_FAM: 35.25 } },
    ],
  },
  cancer: {
    kind: "flat",
    label: "Cancer Insurance",
    rates: { EE: 11.21, EE_CH: 13.18, EE_SP: 22.76, EE_FAM: 24.73 },
  },
  hospital: {
    kind: "plans",
    label: "Hospital Insurance",
    plans: [
      { label: "Enhanced Hospital Plan", rates: { EE: 70.00, EE_CH: 118.71, EE_SP: 141.89, EE_FAM: 190.59 } },
      { label: "Preferred Hospital Plan", rates: { EE: 47.09, EE_CH: 80.87, EE_SP: 96.33, EE_FAM: 129.11 } },
      { label: "Basic Hospital Plan", rates: { EE: 34.04, EE_CH: 58.43, EE_SP: 68.58, EE_FAM: 92.96 } },
      { label: "Choice Hospital Plan", rates: { EE: 19.99, EE_CH: 34.87, EE_SP: 40.19, EE_FAM: 55.08 } },
    ],
  },
  std: {
    kind: "bands",
    label: "Short-Term Disability",
    note: "$500 Weekly Benefit",
    bands: [
      { label: "Under Age 25", rates: { EE: 28.00 } },
      { label: "Age 25 to 29", rates: { EE: 39.00 } },
      { label: "Age 30 to 34", rates: { EE: 64.00 } },
      { label: "Age 35 to 39", rates: { EE: 53.00 } },
      { label: "Age 40 to 44", rates: { EE: 32.50 } },
      { label: "Age 45 to 49", rates: { EE: 31.00 } },
      { label: "Age 50 to 54", rates: { EE: 39.00 } },
      { label: "Age 55 to 59", rates: { EE: 45.00 } },
    ],
  },
};
