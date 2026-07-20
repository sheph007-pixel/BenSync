/**
 * BenSync Risk Screen (KRS) v1.0
 *
 * Deterministic group-level underwriting screen. Sits upstream of the
 * Kennion Actuarial Rater (KAR) - produces a single composite Kennion
 * Risk Index (KRI) and a tier verdict (Preferred / Standard / High Risk).
 *
 * Public API:
 *   screenGroup(input) -> ScreenResult
 *
 * Same census in → same score out. No randomness. Every result carries
 * a model_hash that identifies the methodology + weight set + lookup
 * table hashes used.
 *
 * Inputs are the same census fields used by the rate engine:
 *   relationship · firstName · lastName · dob · sex · zip
 *
 * Composite formula (see METHODOLOGY.md §4.2):
 *
 *   KRI = Demo × Geo × Comp × (1 + clamp(Residual, ±0.10))
 *
 * Demo IS the legacy BenSync Score - same block-calibrated age×gender table.
 * Geo and Comp are multiplicative adjustments. KRI strictly extends the
 * existing score; an underwriter sees the same baseline number, deeper.
 *
 * Drop-in: place at server/risk-screen.ts in the Kennion-Website repo.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { CensusEntry } from "@shared/schema";
import { blockDemographicRisk, legacyAgeBand } from "./risk-factors";
import { priceGroup as priceGroupRate, loadFactorTables, type CensusMember as RateCensusMember } from "./rate-engine";

// ────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────

export type RiskTier = "Preferred" | "Standard" | "High Risk";

export interface ScreenMember {
  relationship: string;
  firstName?: string;
  lastName?: string;
  dob: string | Date;
  sex?: string | null;
  zip?: string | null;
}

export interface ScreenInput {
  census: ScreenMember[];
  effectiveDate: string | Date;
  group?: string;
}

export interface ComponentScore {
  raw: number;          // raw component value
  normalized: number;   // normalized to book-median = 1.00
  contribution: number; // weighted contribution to KRI
  drivers: string[];    // human-readable explanation lines
}

export interface ScreenResult {
  model_version: string;
  model_hash: string;
  group?: string;
  effective_date: string;
  scored_at: string;

  // Group profile
  n_members: number;
  n_employees: number;
  n_spouses: number;
  n_children: number;
  median_age: number;
  avg_age: number;
  pct_female: number;
  family_tier_mix: { EE: number; ECH: number; ESP: number; FAM: number };
  top_county: string;
  pct_top_county: number;
  pct_medicare_cliff: number; // share within 5 yrs of 65

  // Component scores
  demographic: ComponentScore;
  geographic: ComponentScore;
  composition: ComponentScore;
  ai_residual: { raw: number; clamped: number; drivers: string[] };

  // 12-Month forecast (AI model point estimates)
  predicted_pmpy: number;            // average predicted per-member-per-year
  predicted_annual_claims: number;   // sum across all members
  predicted_pmpm: number;            // per-member-per-month  (= pmpy / 12)
  predicted_pepm: number;            // per-employee-per-month (= annual_claims / 12 / n_employees)
  book_mean_pmpy: number;            // reference book mean for comparison
  book_mean_pmpm: number;            // book mean per-member-per-month

  // Per-plan funding vs claims projection
  plan_projections: Array<{
    plan: string;
    funding_monthly: number;     // total monthly premium across the group at this plan
    funding_pmpm: number;        // funding per covered member per month
    claims_pmpm: number;         // predicted claims per covered member per month
    loss_ratio: number;          // predicted claims / funding (1.0 = breakeven)
    margin: number;              // funding - predicted claims, monthly
  }>;

  // Composite
  kri: number;
  tier: RiskTier;
  decision: "QUOTE" | "QUOTE_WITH_REVIEW" | "DECLINE";

  // Top drivers across all components, sorted by contribution magnitude
  top_drivers: Array<{ category: string; text: string; impact: number }>;

  // AI summary narrative (3-5 sentences)
  ai_summary: string;
}

interface MepsCell {
  mean_totexp: number;
  mean_totprv: number;
  p90_totexp: number;
  n: number;
}

interface MepsTable {
  version: string;
  source_files: string[];
  source_sha256: string;
  built_at: string;
  // Key format: `${ageBand}|${sex}|${region}` e.g. "40-44|M|3"
  cells: Record<string, MepsCell>;
  national_book_median_pmpy: number; // calibration constant E_k
}

interface PlacesCounty {
  fips: string;
  name: string;
  state: string;
  diabetes: number | null;
  obesity: number | null;
  csmoking: number | null;
  copd: number | null;
  bphigh: number | null;
  mhlth: number | null;
  geo_z: number; // composite Z-score across the 6 indicators
}

interface PlacesTable {
  version: string;
  source_file: string;
  source_sha256: string;
  built_at: string;
  national_means: Record<string, { mean: number; sd: number }>;
  counties: Record<string, PlacesCounty>; // keyed by FIPS
}

interface ResidualModel {
  model_type: string;
  version: string;
  trained_at: string;
  trained_on: {
    n_members: number;
    n_groups: number;
    groups: string[];
    total_paid: number;
    mean_pmpy: number;
    cv_pearson_mean: number;
    cv_pearson_std: number;
  };
  feature_order: string[];
  coefficients: Record<string, number>;
  block_mean_pmpy: number;
  residual_bounds: { min: number; max: number };
}

interface ZipToCounty {
  version: string;
  source: string;
  built_at: string;
  // ZIP5 → county FIPS (primary)
  zip5: Record<string, string>;
  // ZIP3 → county FIPS (fallback for unknown ZIP5)
  zip3: Record<string, string>;
}

interface ModelWeights {
  version: string;
  w_demo: number;
  w_geo: number;
  w_comp: number;
  alpha_geo_scaling: number;     // α in Geo formula
  beta_medicare_cliff: number;   // β1
  beta_concentration: number;    // β2
  small_group_threshold: number; // employees below this get a load
  small_group_load: number;      // multiplicative
  thresholds: { preferred: number; high_risk: number };
  geo_normalized_clamp?: { min: number; max: number };
}

// ────────────────────────────────────────────────────────────────────────
// Lookup-table loading (cached)
// ────────────────────────────────────────────────────────────────────────

const SCREEN_DIR = path.resolve(process.cwd(), "server", "screen");

let _meps: MepsTable | null = null;
let _places: PlacesTable | null = null;
let _zipMap: ZipToCounty | null = null;
let _weights: ModelWeights | null = null;
let _residual: ResidualModel | null = null;

function loadJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(SCREEN_DIR, file), "utf8")) as T;
}

export function loadScreenTables(): {
  meps: MepsTable; places: PlacesTable; zipMap: ZipToCounty; weights: ModelWeights; residual: ResidualModel | null;
} {
  if (!_meps)    _meps    = loadJson<MepsTable>("meps-expected-cost.json");
  if (!_places)  _places  = loadJson<PlacesTable>("places-county-index.json");
  if (!_zipMap)  _zipMap  = loadJson<ZipToCounty>("zip-to-county.json");
  if (!_weights) _weights = loadJson<ModelWeights>("model-weights.json");
  if (!_residual) {
    try { _residual = loadJson<ResidualModel>("residual-model.json"); }
    catch { _residual = null; }
  }
  return { meps: _meps, places: _places, zipMap: _zipMap, weights: _weights, residual: _residual };
}

export function reloadScreenTables(): void {
  _meps = null; _places = null; _zipMap = null; _weights = null; _residual = null;
}

function computeModelHash(
  meps: MepsTable, places: PlacesTable, zipMap: ZipToCounty, weights: ModelWeights,
): string {
  const h = crypto.createHash("sha256");
  h.update(meps.source_sha256);
  h.update(places.source_sha256);
  h.update(zipMap.version);
  h.update(JSON.stringify(weights));
  return h.digest("hex").slice(0, 12);
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function parseDate(d: string | Date): Date {
  if (d instanceof Date) return d;
  const s = String(d).trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (us) {
    let y = +us[3];
    if (y < 100) y += (y < 30 ? 2000 : 1900);
    return new Date(y, +us[1] - 1, +us[2]);
  }
  const d2 = new Date(s);
  if (!isNaN(d2.getTime())) return d2;
  throw new Error(`Unparseable date: ${s}`);
}

function ageAsOf(dob: Date, eff: Date): number {
  let y = eff.getFullYear() - dob.getFullYear();
  if (eff.getMonth() < dob.getMonth() ||
      (eff.getMonth() === dob.getMonth() && eff.getDate() < dob.getDate())) y--;
  return Math.max(0, y);
}

function ageBand(age: number): string {
  if (age < 5)   return "0-4";
  if (age < 10)  return "5-9";
  if (age < 15)  return "10-14";
  if (age < 20)  return "15-19";
  if (age < 25)  return "20-24";
  if (age < 30)  return "25-29";
  if (age < 35)  return "30-34";
  if (age < 40)  return "35-39";
  if (age < 45)  return "40-44";
  if (age < 50)  return "45-49";
  if (age < 55)  return "50-54";
  if (age < 60)  return "55-59";
  if (age < 65)  return "60-64";
  return "65+";
}

function sexCode(sex?: string | null): "M" | "F" {
  const s = (sex || "").trim().toUpperCase();
  if (s.startsWith("M")) return "M";
  return "F";
}

function relCode(rel: string): "EE" | "SP" | "CH" {
  const r = (rel || "").trim().toLowerCase();
  if (r === "ee" || r.startsWith("emp") || r === "subscriber" || r === "self" || r === "primary") return "EE";
  if (r === "sp" || r.startsWith("spo") || r.includes("partner")) return "SP";
  return "CH";
}

function tierWeight(rel: "EE" | "SP" | "CH"): number {
  // Mirrors the actuary's tier factors for consistent expected-cost weighting.
  // Members in households with kids and/or spouse get prorated tier shares.
  return rel === "EE" ? 1.0 : rel === "SP" ? 1.0 : 0.85;
}

function lookupCounty(zip: string | null | undefined, zm: ZipToCounty): string | null {
  if (!zip) return null;
  const z5 = zip.replace(/\D/g, "").slice(0, 5);
  if (zm.zip5[z5]) return zm.zip5[z5];
  const z3 = z5.slice(0, 3);
  return zm.zip3[z3] || null;
}

function regionFromState(state?: string | null): "1" | "2" | "3" | "4" {
  // MEPS Census Region: 1=NE, 2=MW, 3=South, 4=West.
  // For Kennion's predominantly-AL book, default to South.
  // (Inferred from ZIP later if state missing - for now use South.)
  return "3";
}

// ────────────────────────────────────────────────────────────────────────
// Core scoring
// ────────────────────────────────────────────────────────────────────────

interface EnrichedMember {
  rel: "EE" | "SP" | "CH";
  age: number;
  ageBand: string;
  sex: "M" | "F";
  zip: string | null;
  countyFips: string | null;
  countyZ: number | null;
  expectedPmpy: number;
  blockRisk: number;
}


// Tweedie GLM (log-link) member-level predicted PMPY, trained on Kennion block.
function predictMemberPmpy(model: ResidualModel, m: EnrichedMember): number {
  const age = m.age - 35.0;
  const a = age / 10.0;
  const male = m.sex === "M" ? 1.0 : 0.0;
  const spouse = m.rel === "SP" ? 1.0 : 0.0;
  const child = m.rel === "CH" ? 1.0 : 0.0;
  const geo = m.countyZ ?? 0.0;
  const c = model.coefficients;
  const lin =
    (c.intercept ?? 0) +
    (c.age       ?? 0) * a +
    (c.age2      ?? 0) * a * a +
    (c.age3      ?? 0) * (a * a * a) / 6.0 +
    (c.male      ?? 0) * male +
    (c.spouse    ?? 0) * spouse +
    (c.child     ?? 0) * child +
    (c.geo_z     ?? 0) * geo +
    (c.age_x_male ?? 0) * a * male;
  return Math.exp(lin);
}

export function screenGroup(input: ScreenInput): ScreenResult {
  const { meps, places, zipMap, weights, residual } = loadScreenTables();
  const eff = parseDate(input.effectiveDate);

  // ── 1. Enrich each member ─────────────────────────────────────────────
  const members: EnrichedMember[] = input.census.map(m => {
    const dob = parseDate(m.dob);
    const age = ageAsOf(dob, eff);
    const ab = ageBand(age);
    const sex = sexCode(m.sex);
    const zip = (m.zip || "").trim() || null;
    const fips = lookupCounty(zip, zipMap);
    const region = regionFromState(null);
    const cellKey = `${ab}|${sex}|${region}`;
    const cell = meps.cells[cellKey];
    const expectedPmpy = cell ? cell.mean_totexp : meps.national_book_median_pmpy;
    const cz = fips && places.counties[fips] ? places.counties[fips].geo_z : null;
    return {
      rel: relCode(m.relationship),
      age, ageBand: ab, sex, zip,
      countyFips: fips,
      countyZ: cz,
      expectedPmpy,
      blockRisk: blockDemographicRisk(age, sex === "M" ? "Male" : "Female"),
    };
  });

  // ── 2. Group profile ──────────────────────────────────────────────────
  const N = members.length;
  const employees = members.filter(m => m.rel === "EE");
  const spouses   = members.filter(m => m.rel === "SP");
  const children  = members.filter(m => m.rel === "CH");
  const ages = members.map(m => m.age).sort((a,b) => a-b);
  const median_age = ages[Math.floor(ages.length / 2)];
  const avg_age = ages.reduce((s,x) => s+x, 0) / N;
  const pct_female = members.filter(m => m.sex === "F").length / N;
  const pct_medicare_cliff = members.filter(m => m.age >= 60 && m.age <= 64).length / N;

  // Tier mix from household chains (matches rate-engine logic)
  const tierMix = { EE: 0, ECH: 0, ESP: 0, FAM: 0 };
  let curHH: EnrichedMember[] = [];
  const closeHH = () => {
    if (!curHH.length) return;
    const ee = curHH.find(x => x.rel === "EE");
    if (!ee) return;
    const hasSP = curHH.some(x => x.rel === "SP");
    const hasCH = curHH.some(x => x.rel === "CH");
    if (hasSP && hasCH) tierMix.FAM++;
    else if (hasSP)     tierMix.ESP++;
    else if (hasCH)     tierMix.ECH++;
    else                tierMix.EE++;
  };
  for (const m of members) {
    if (m.rel === "EE") { closeHH(); curHH = [m]; }
    else curHH.push(m);
  }
  closeHH();

  // County concentration
  const countyCounts = new Map<string, number>();
  for (const m of members) {
    if (m.countyFips) {
      countyCounts.set(m.countyFips, (countyCounts.get(m.countyFips) || 0) + 1);
    }
  }
  let top_county = "Unknown", top_count = 0;
  for (const [fips, count] of Array.from(countyCounts.entries())) {
    if (count > top_count) { top_count = count; top_county = fips; }
  }
  const top_county_name = places.counties[top_county]
    ? `${places.counties[top_county].name}, ${places.counties[top_county].state}`
    : "Unknown";
  const pct_top_county = N > 0 ? top_count / N : 0;

  // ── 3. Demographic component ──────────────────────────────────────────
  // Uses Kennion's block-calibrated (age × gender) risk factor table -
  // the SAME table that produces the legacy "BenSync Score". KRS keeps
  // this number identical so the two surfaces agree.
  const blockRisks = members.map(m => m.blockRisk);
  const demoNormalized = blockRisks.length > 0
    ? blockRisks.reduce((s, x) => s + x, 0) / blockRisks.length
    : 1.0;
  // Also compute MEPS-based expected cost for diagnostic display only.
  let weightedExp = 0, sumW = 0;
  for (const m of members) {
    const w = tierWeight(m.rel);
    weightedExp += m.expectedPmpy * w;
    sumW += w;
  }
  const groupExpectedPmpy = sumW > 0 ? weightedExp / sumW : 0;
  const demoDrivers: string[] = [];
  if (avg_age >= 50) demoDrivers.push(`Avg age ${avg_age.toFixed(1)} elevates demographic risk`);
  if (pct_medicare_cliff >= 0.10) demoDrivers.push(`${(pct_medicare_cliff*100).toFixed(0)}% of group within 5 yrs of Medicare`);
  if (pct_female > 0.60) demoDrivers.push(`Female-heavy mix (${(pct_female*100).toFixed(0)}%) - higher utilization profile`);
  const demo: ComponentScore = {
    raw: demoNormalized,                 // raw = the BenSync Score itself
    normalized: demoNormalized,          // 1.00 = book median
    contribution: demoNormalized,        // baseline multiplier in the composite
    drivers: demoDrivers,
  };

  // ── 4. Geographic component ───────────────────────────────────────────
  const geoZs = members.map(m => m.countyZ).filter((z): z is number => z !== null);
  const meanGeoZ = geoZs.length > 0 ? geoZs.reduce((s,x) => s+x, 0) / geoZs.length : 0;
  const geoRaw = 1 + weights.alpha_geo_scaling * meanGeoZ;
  const geoClamp = weights.geo_normalized_clamp ?? { min: 0.92, max: 1.08 };
  const geoNormalized = Math.max(geoClamp.min, Math.min(geoClamp.max, geoRaw));
  const geoDrivers: string[] = [];
  if (meanGeoZ > 0.5) geoDrivers.push(`Members concentrated in counties ${meanGeoZ.toFixed(2)} SD above national health-risk mean`);
  if (pct_top_county > 0.5 && places.counties[top_county]?.geo_z && places.counties[top_county].geo_z > 0.3) {
    geoDrivers.push(`${(pct_top_county*100).toFixed(0)}% of members in single high-risk county (${top_county_name})`);
  }
  const geo: ComponentScore = {
    raw: meanGeoZ,
    normalized: geoNormalized,
    contribution: weights.w_geo * geoNormalized,
    drivers: geoDrivers,
  };

  // ── 5. Composition component ──────────────────────────────────────────
  const cliff = pct_medicare_cliff;
  // Family-tier share - more FAM/ECH households means more dependent claim
  // volume that age×gender on the employee alone doesn't capture.
  const totalHH = tierMix.EE + tierMix.ECH + tierMix.ESP + tierMix.FAM;
  const famShare = totalHH > 0 ? tierMix.FAM / totalHH : 0;
  const compNormalized =
    (1 + weights.beta_medicare_cliff * cliff) *
    (1 + 0.10 * famShare);   // family-tier load: 10% × FAM share
  const compDrivers: string[] = [];
  if (cliff >= 0.10) compDrivers.push(`Medicare-cliff exposure: ${(cliff*100).toFixed(0)}% within 5 yrs of 65`);
  if (famShare >= 0.30) compDrivers.push(`Family-tier heavy (${(famShare*100).toFixed(0)}% FAM) - higher dependent claim volume`);
  const comp: ComponentScore = {
    raw: 1.0,
    normalized: compNormalized,
    contribution: weights.w_comp * compNormalized,
    drivers: compDrivers,
  };

  // ── 6. AI residual - Tweedie GLM trained on Kennion block paid claims ────
  // Predicts per-member PMPY from age × gender × tier × geo_z, then compares
  // the group's predicted PMPY to the block mean to produce a bounded
  // multiplicative adjustment.
  let aiResidualRaw = 0;
  let aiPredictedPmpy = 0;
  if (residual && residual.coefficients) {
    const memberPreds = members.map(m => predictMemberPmpy(residual, m));
    aiPredictedPmpy = memberPreds.reduce((s, x) => s + x, 0) / Math.max(1, memberPreds.length);
    const blockMean = residual.block_mean_pmpy || 6470;
    // Raw signal: log-ratio of predicted to block mean. Damped 0.5x so we
    // don't double-count signal already in the Demographic component.
    aiResidualRaw = 0.5 * Math.log(aiPredictedPmpy / blockMean);
  }
  const bounds = residual?.residual_bounds ?? { min: -0.10, max: 0.10 };
  const aiResidualClamped = Math.max(bounds.min, Math.min(bounds.max, aiResidualRaw));
  const aiResidualDrivers: string[] = residual
    ? [`Block-trained ML predicts $${aiPredictedPmpy.toFixed(0)} PMPY vs. $${(residual.block_mean_pmpy||6470).toFixed(0)} book mean (residual ${(aiResidualClamped*100).toFixed(1)}%)`]
    : [];

  // ── 7. Composite KRI ──────────────────────────────────────────────────
  // MULTIPLICATIVE composite. KRI = (block demographic) × (geo loading) × (comp loading) × (1 + AI residual).
  // The Demographic component IS the legacy BenSync Score. Geographic and
  // Composition are adjustments LAYERED on top - so a group with a 1.04
  // BenSync Score and elevated geo + comp scores ends up at 1.04 × ... ≥ 1.04.
  const kri = demo.normalized * geo.normalized * comp.normalized * (1 + aiResidualClamped);

  // ── 8. Tier verdict ───────────────────────────────────────────────────
  let tier: RiskTier;
  let decision: ScreenResult["decision"];
  if (kri < weights.thresholds.preferred) {
    tier = "Preferred";
    decision = "QUOTE";
  } else if (kri < weights.thresholds.high_risk) {
    tier = "Standard";
    decision = "QUOTE";
  } else {
    tier = "High Risk";
    decision = "DECLINE";
  }

  // ── 8.5. Per-plan funding-vs-claims projections ──────────────────────
  // Call the certified actuarial rate engine for THIS census, then for
  // Deluxe Platinum (richest plan) + Freedom Bronze (cheapest), compute
  // total monthly premium using the actual tier mix and compare against
  // predicted claims. Gives the underwriter an immediate "would we make
  // money on this group?" answer bounded by best-plan and worst-plan
  // scenarios.
  let plan_projections: any[] = [];
  try {
    const rateCensus: RateCensusMember[] = input.census.map(m => ({
      relationship: m.relationship,
      firstName: m.firstName,
      lastName: m.lastName,
      dob: m.dob,
      sex: m.sex,
      zip: m.zip,
    }));
    const pricing = priceGroupRate({
      census: rateCensus,
      effectiveDate: input.effectiveDate,
    });
    const factorTables = loadFactorTables();

    // Book-average plan claims_unadjusted across all plans in the rate
    // engine, used to scale the AI's plan-agnostic prediction to plan-
    // specific claims. Bronze pays half of Platinum on the same population
    // because of plan design; this normalization captures that.
    const allPlanClaims = Object.values(factorTables.plan_base_pmpm_6to1)
      .map((p: any) => p.claims_unadjusted)
      .filter((c: any) => typeof c === "number" && c > 0) as number[];
    const bookAvgClaimsU =
      allPlanClaims.length > 0
        ? allPlanClaims.reduce((a, b) => a + b, 0) / allPlanClaims.length
        : 150;

    // AI's plan-agnostic prediction translated to PMPM and trended forward.
    // The AI was trained on actual paid claims across whatever plan mix
    // existed in the training data, treat that as the book-average plan
    // and scale up/down for richer/cheaper plans below.
    const trend = factorTables.trend_rate ? Math.pow(1 + factorTables.trend_rate, 1) : 1.07;
    const aiPmpmBookPlan = aiPredictedPmpy / 12;  // AI's prediction at book-avg plan design

    const PLANS_TO_SHOW = ["Deluxe Platinum", "Freedom Bronze"];
    for (const planName of PLANS_TO_SHOW) {
      const tiered = pricing.plan_rates[planName];
      const planFactors = factorTables.plan_base_pmpm_6to1[planName];
      if (!tiered || !planFactors) continue;

      // Total monthly funding from rate engine using actual tier mix
      const fundingMonthly =
        tierMix.EE  * tiered.EE +
        tierMix.ECH * tiered.EC +
        tierMix.ESP * tiered.ES +
        tierMix.FAM * tiered.EF;
      const fundingPmpm = N > 0 ? fundingMonthly / N : 0;

      // Plan-specific predicted claims:
      //   AI's book-plan PMPM × (plan claims / book-avg plan claims)
      // Bronze's claims_unadjusted ($87.47) is about half Platinum's
      // ($172.67) because cost-sharing reduces what the plan pays out.
      const planFactor = (planFactors.claims_unadjusted ?? bookAvgClaimsU) / bookAvgClaimsU;
      const planClaimsPmpm = aiPmpmBookPlan * planFactor;
      const planClaimsMonthly = planClaimsPmpm * N;

      const lossRatio = fundingPmpm > 0 ? planClaimsPmpm / fundingPmpm : 0;
      const margin = fundingMonthly - planClaimsMonthly;
      plan_projections.push({
        plan: planName,
        funding_monthly: Math.round(fundingMonthly),
        funding_pmpm: round2(fundingPmpm),
        claims_pmpm: round2(planClaimsPmpm),
        loss_ratio: round4(lossRatio),
        margin: Math.round(margin),
      });
    }
  } catch (e) {
    // Rate engine couldn't price (missing tables, bad census, etc.) - leave empty
    plan_projections = [];
  }

  // ── 9. Top drivers - describe the score, not threshold violations ────
  // Always populate so every screen has a populated "why" panel.
  // Drivers describe the *most informative* facts about this group's score.
  const drivers: Array<{ category: string; text: string; impact: number }> = [];

  // Demographic - show the strongest signal in the age/sex mix.
  if (avg_age >= 45) {
    drivers.push({
      category: "Demographic",
      text: `Avg age ${avg_age.toFixed(0)} elevates expected medical cost (book median ≈ 40)`,
      impact: +(demoNormalized - 1.0),
    });
  } else if (avg_age <= 35) {
    drivers.push({
      category: "Demographic",
      text: `Young workforce (average age ${avg_age.toFixed(0)}) - expected to cost less than a typical group`,
      impact: +(demoNormalized - 1.0),
    });
  } else {
    drivers.push({
      category: "Demographic",
      text: `Typical age mix (average ${avg_age.toFixed(0)}, median ${median_age}) - expected cost is ${(demoNormalized * 100).toFixed(0)}% of a typical group`,
      impact: +(demoNormalized - 1.0),
    });
  }
  if (pct_female >= 0.60) {
    drivers.push({
      category: "Demographic",
      text: `Mostly women (${(pct_female * 100).toFixed(0)}%) - women tend to use more healthcare`,
      impact: +0.05,
    });
  } else if (pct_female <= 0.40) {
    drivers.push({
      category: "Demographic",
      text: `Mostly men (${((1 - pct_female) * 100).toFixed(0)}%) - men tend to use less preventive care`,
      impact: -0.03,
    });
  }
  if (pct_medicare_cliff >= 0.10) {
    drivers.push({
      category: "Demographic",
      text: `${(pct_medicare_cliff * 100).toFixed(0)}% of the group is within 5 years of age 65 (most expensive age band)`,
      impact: +0.08 * pct_medicare_cliff,
    });
  }

  // Geographic - describe the county exposure regardless of magnitude.
  if (meanGeoZ >= 0.30) {
    drivers.push({
      category: "Geographic",
      text: `Members live in areas with higher-than-average rates of diabetes, obesity, and other ongoing health conditions`,
      impact: +(geoNormalized - 1.0),
    });
  } else if (meanGeoZ <= -0.20) {
    drivers.push({
      category: "Geographic",
      text: `Members live in healthier-than-average areas`,
      impact: +(geoNormalized - 1.0),
    });
  } else {
    drivers.push({
      category: "Geographic",
      text: `Members live in areas with average health risk`,
      impact: +(geoNormalized - 1.0),
    });
  }
  // County concentration doesn't matter in a pooled captive - pool diversifies.
  // Not surfaced as a driver.

  // Composition - group structure facts.
  // Group size doesn't matter in a pooled captive - captive absorbs the
  // variance. Not surfaced as a driver.
  const totalHouseholds = tierMix.EE + tierMix.ECH + tierMix.ESP + tierMix.FAM;
  const famPct = totalHouseholds > 0
    ? (tierMix.FAM / totalHouseholds)
    : 0;
  if (famPct >= 0.30) {
    drivers.push({
      category: "Composition",
      text: `Many family enrollments (${(famPct * 100).toFixed(0)}% FAM) - more dependents means more claims`,
      impact: +0.10 * famPct,
    });
  }

  // AI residual driver - show predicted vs pool PMPY so the impact is concrete.
  if (residual && aiResidualClamped !== 0) {
    drivers.push({
      category: "AI",
      text: `Kennion AI model (trained on our claims history) expects this group to ${aiResidualClamped > 0 ? "cost more" : "cost less"} than the deterministic math predicts (${(aiResidualClamped * 100).toFixed(1)}% adjustment)`,
      impact: aiResidualClamped,
    });
  }

  // Sort by absolute impact, keep top 5.
  drivers.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  const top_drivers = drivers.slice(0, 5);

  // ── 10. AI summary narrative ──────────────────────────────────────────
  const ai_summary = buildSummary({
    tier, kri, demo, geo, comp,
    top_county_name,
    meanGeoZ,
    aiResidualClamped,
    aiPredictedPmpy,
    groupName: input.group,
    avg_age, median_age,
    n: N, n_employees: employees.length, n_spouses: spouses.length, n_children: children.length,
    pct_female,
    pct_medicare_cliff: cliff,
    pct_top_county,
    fam_share: totalHouseholds > 0 ? tierMix.FAM / totalHouseholds : 0,
  });

  return {
    model_version: weights.version,
    model_hash: computeModelHash(meps, places, zipMap, weights),
    group: input.group,
    effective_date: eff.toISOString().slice(0, 10),
    scored_at: new Date().toISOString(),

    n_members: N,
    n_employees: employees.length,
    n_spouses: spouses.length,
    n_children: children.length,
    median_age,
    avg_age: round2(avg_age),
    pct_female: round4(pct_female),
    family_tier_mix: tierMix,
    top_county: top_county_name,
    pct_top_county: round4(pct_top_county),
    pct_medicare_cliff: round4(cliff),

    demographic: demo,
    geographic: geo,
    composition: comp,
    ai_residual: { raw: aiResidualRaw, clamped: aiResidualClamped, drivers: aiResidualDrivers },
    predicted_pmpy: round2(aiPredictedPmpy),
    predicted_annual_claims: Math.round(aiPredictedPmpy * N),
    predicted_pmpm: round2(aiPredictedPmpy / 12),
    predicted_pepm: round2((aiPredictedPmpy * N) / 12 / Math.max(1, employees.length)),
    book_mean_pmpy: residual?.block_mean_pmpy ?? 6470,
    book_mean_pmpm: round2((residual?.block_mean_pmpy ?? 6470) / 12),
    plan_projections,

    kri: round4(kri),
    tier,
    decision,

    top_drivers,
    ai_summary,
  };
}

function buildSummary(ctx: {
  tier: RiskTier; kri: number;
  demo: ComponentScore; geo: ComponentScore; comp: ComponentScore;
  top_county_name: string;
  meanGeoZ: number;
  aiResidualClamped: number;
  aiPredictedPmpy: number;
  groupName?: string;
  avg_age: number; median_age: number;
  n: number; n_employees: number; n_spouses: number; n_children: number;
  pct_female: number;
  pct_medicare_cliff: number;
  pct_top_county: number;
  fam_share: number;
}): string {
  const parts: string[] = [];
  const name = ctx.groupName || "This group";
  const scoreStr = ctx.kri.toFixed(2);

  // === Opening sentence, names the group, score, tier, and what the
  // program rule says about it. ===
  if (ctx.tier === "Preferred") {
    parts.push(`${name} earned a BenSync Score of ${scoreStr} (Preferred) - a clear fit for our program, exactly the type of group that strengthens the captive pool.`);
  } else if (ctx.tier === "Standard") {
    parts.push(`${name} earned a BenSync Score of ${scoreStr} (Standard) - a typical fit for our program, with some risk factors that pricing should reflect.`);
  } else {
    parts.push(`${name} earned a BenSync Score of ${scoreStr} (High Risk) - this group does not qualify for a BenSync quote.`);
  }

  // === Group profile sentence, specific to this census ===
  const tiersDesc: string[] = [];
  if (ctx.n_employees) tiersDesc.push(`${ctx.n_employees} employee${ctx.n_employees === 1 ? "" : "s"}`);
  if (ctx.n_spouses)   tiersDesc.push(`${ctx.n_spouses} spouse${ctx.n_spouses === 1 ? "" : "s"}`);
  if (ctx.n_children)  tiersDesc.push(`${ctx.n_children} dependent${ctx.n_children === 1 ? "" : "s"}`);
  const tiersJoined = tiersDesc.join(", ");
  const femalePct = (ctx.pct_female * 100).toFixed(0);
  const genderDesc =
    ctx.pct_female >= 0.60 ? `skewed female at ${femalePct}%` :
    ctx.pct_female <= 0.40 ? `skewed male at ${(100 - +femalePct).toFixed(0)}%` :
    `balanced at ${femalePct}% female`;
  parts.push(`The ${ctx.n}-life group (${tiersJoined}) averages age ${ctx.avg_age.toFixed(0)} and is ${genderDesc}.`);

  // === Demographic-specific sentence ===
  if (ctx.demo.normalized >= 1.10) {
    parts.push(`Age and gender mix is materially older than typical, with expected medical cost at ${(ctx.demo.normalized * 100).toFixed(0)}% of a typical Kennion group.`);
  } else if (ctx.demo.normalized <= 0.85) {
    parts.push(`Age and gender mix is favorable, with expected medical cost at ${(ctx.demo.normalized * 100).toFixed(0)}% of a typical Kennion group - a young, healthy profile.`);
  } else if (ctx.demo.normalized < 1.0) {
    parts.push(`Age and gender mix is slightly favorable, running ${((1 - ctx.demo.normalized) * 100).toFixed(0)}% below a typical Kennion group on expected cost.`);
  } else {
    parts.push(`Age and gender mix is close to typical, with expected medical cost at ${(ctx.demo.normalized * 100).toFixed(0)}% of book.`);
  }

  // === Medicare-cliff callout (only if meaningful) ===
  if (ctx.pct_medicare_cliff >= 0.15) {
    parts.push(`${(ctx.pct_medicare_cliff * 100).toFixed(0)}% of the group is within five years of age 65 - the most expensive age band - and that concentration is a real factor in the score.`);
  } else if (ctx.pct_medicare_cliff >= 0.08) {
    parts.push(`${(ctx.pct_medicare_cliff * 100).toFixed(0)}% of the group is approaching Medicare age, which adds modest cost pressure.`);
  }

  // === Family-tier callout (only if meaningful) ===
  if (ctx.fam_share >= 0.30) {
    parts.push(`${(ctx.fam_share * 100).toFixed(0)}% of households are at the family tier, adding dependent claim volume that the age mix alone does not capture.`);
  }

  // === Geographic sentence, name the top county explicitly ===
  if (ctx.meanGeoZ >= 0.5) {
    parts.push(`Members are concentrated in ${ctx.top_county_name} and surrounding areas with notably higher rates of diabetes, obesity, smoking, and other ongoing health conditions than the national average.`);
  } else if (ctx.meanGeoZ >= 0.2) {
    parts.push(`Most members live in or around ${ctx.top_county_name}, where chronic-disease rates run modestly above the national average.`);
  } else if (ctx.meanGeoZ <= -0.3) {
    parts.push(`Members are clustered in ${ctx.top_county_name} and similarly healthier-than-average counties, which is a positive selection signal.`);
  } else {
    parts.push(`Members are mostly in ${ctx.top_county_name}, an area with average health risk relative to the national baseline.`);
  }

  // === AI Residual sentence, explains what the trained model sees ===
  if (Math.abs(ctx.aiResidualClamped) >= 0.07) {
    if (ctx.aiResidualClamped > 0) {
      parts.push(`The Kennion AI model, trained directly on our captive's paid-claim history, applied its maximum upward adjustment (+${(ctx.aiResidualClamped * 100).toFixed(1)}%) - the model would push the score even higher if it were not bounded, meaning this profile has historically produced costs above what the deterministic math predicts.`);
    } else {
      parts.push(`The Kennion AI model, trained directly on our captive's paid-claim history, applied its maximum favorable adjustment (${(ctx.aiResidualClamped * 100).toFixed(1)}%) - groups of this profile have historically run cheaper than the deterministic math predicts.`);
    }
  } else if (Math.abs(ctx.aiResidualClamped) >= 0.02) {
    const dir = ctx.aiResidualClamped > 0 ? "slightly higher cost" : "slightly lower cost";
    parts.push(`The Kennion AI model, trained on our claim history, sees ${dir} than the deterministic math suggests for this profile (${(ctx.aiResidualClamped * 100).toFixed(1)}% adjustment).`);
  } else {
    parts.push(`The Kennion AI model, trained on our claim history, sees this profile as close to what the deterministic math already predicts (${(ctx.aiResidualClamped * 100).toFixed(1)}% adjustment, essentially neutral).`);
  }

  // === Closing recommendation, tied to program rules ===
  if (ctx.tier === "Preferred") {
    parts.push(`Recommendation: Quote competitively. Preferred groups are exactly the kind of additions that protect the captive's long-term loss curve.`);
  } else if (ctx.tier === "Standard") {
    const needsLoad = ctx.demo.normalized > 1.05 || ctx.geo.normalized > 1.05 || ctx.aiResidualClamped > 0.03;
    if (needsLoad) {
      parts.push(`Recommendation: Quote with risk-adjusted pricing. Standard groups fit our program, but pricing should reflect the elevated factors flagged above.`);
    } else {
      parts.push(`Recommendation: Quote at standard pricing. Standard groups fit our program and add credibility to the pool.`);
    }
  } else {
    parts.push(`Recommendation: Decline. Per BenSync program policy, only Preferred and Standard groups are admitted to the captive. Admitting a High Risk group would shift the pool's loss curve in a direction the program's structure - aggregate stop-loss, RBP pricing caps, and reserves - cannot reliably absorb.`);
  }

  return parts.join(" ");
}

function round2(x: number): number { return Math.round(x * 100) / 100; }
function round4(x: number): number { return Math.round(x * 10000) / 10000; }

// ────────────────────────────────────────────────────────────────────────
// CensusEntry (Drizzle) adapter - same shape as rate-engine
// ────────────────────────────────────────────────────────────────────────
export function censusEntriesToScreenMembers(rows: CensusEntry[]): ScreenMember[] {
  return rows.map(r => ({
    relationship: r.relationship,
    firstName: r.firstName,
    lastName: r.lastName,
    dob: r.dateOfBirth,
    sex: r.gender,
    zip: r.zipCode || null,
  }));
}
