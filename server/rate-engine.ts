/**
 * BenSync Rate Engine (TypeScript), v1.3
 *
 * Deterministic port of the actuary's "Kennion Actuarial Rater.xlsm" RBP
 * composite rating math. Reads factor tables from ./factor-tables.json
 * (regenerated from the .xlsm by scripts/sync-rater.py).
 *
 * Runs in-process, no LibreOffice, no VBA, no shell-out.
 *
 * Public API:
 *   priceGroup(input, tablesOverride?) -> PricingResult
 *
 * Pricing formula (verified bit-for-bit against the actuary xlsm for the
 * SAMPLE CENSUS, Birmingham, eff 2026-04-01 → Deluxe Platinum EE $760.75,
 * Freedom Bronze EE $385.39):
 *
 *   claims_trended   = claims_unadjusted × trend_adj
 *   claims_with_sl   = claims_trended × (1 + phic_loading)   // phic_loading = 0.20
 *   composite_factor = (Σ member_age_factor_included) / (Σ household_tier_factor)
 *   ee_pre_expense   = claims_with_sl × composite_factor × area_factor
 *   ee_rate          = ee_pre_expense / (1 − fixed_expense_pct)   // 0.2905 grossup
 *   tier_rate        = ee_rate × (tier_factor / EE_tier_factor)
 *
 *   trend_adj        = (1 + trend_rate) ^ ((eff_date − base_rate_date) / 365)
 *
 * Dependent-cap rule (replicates the xlsm DepExcld pivot table):
 *   Within each family (matched by last name), if >3 children have age ≤20,
 *   keep only the 3 OLDEST; the remaining children's age factors drop out of
 *   Σ member_age_factor. Household tier factor is unchanged.
 */
import fs from "fs";
import path from "path";
import type { CensusEntry } from "@shared/schema";
import { inferRatingArea, type RatingArea } from "@shared/rating-area";

export { inferRatingArea, type RatingArea };

// ─── Types ────────────────────────────────────────────────────────────────

export interface FactorTables {
  version: string;
  source_file: string;
  source_sha256: string;
  synced_at: string;
  age_factors: Record<string, number>;       // JSON keys come back as strings
  area_factors: Record<string, number | null>;
  tier_factors_default: { EE: number; ECH: number; ESP: number; FAM: number };
  plan_base_pmpm_6to1: Record<string, {
    total_margin: number;
    base_3to1?: number | null;
    claims_unadjusted?: number | null;
    agg_sl_adj?: number | null;
  }>;
  trend_rate: number;
  phic_stoploss?: number;        // 1.2  → phic_loading = stoploss − 1 = 0.20
  fixed_expense_pct?: number;    // 0.2905 admin & expenses grossup divisor
  expense_pepm?: Record<string, number | null>;
  base_rate_date?: string;       // ISO date, defaults to 2025-01-01
}

export interface CensusMember {
  relationship: string;     // Employee | Spouse | Child | Dependent
  firstName?: string;
  lastName?: string;
  dob: string | Date;       // ISO string, MM/DD/YYYY, or Date
  sex?: string | null;
  state?: string | null;
  zip?: string | null;
}

export type Admin =
  | "EBPA" | "HEALTHEZ" | "Virtual_RBP" | "Virtual_RBP_HEALTHEZ";

export interface PriceGroupInput {
  census: CensusMember[];
  effectiveDate: string | Date;
  ratingArea?: RatingArea;
  admin?: Admin;
  baseRateDate?: string | Date;     // defaults to tables.base_rate_date or 2025-01-01
  group?: string;                   // echoed back in output
}

export interface PlanRate { EE: number; EC: number; ES: number; EF: number; }

export interface PricingResult {
  engine_version: string;
  factor_tables_version: string;
  factor_tables_sha256: string;
  group?: string;
  effective_date: string;
  rating_area: string;
  area_factor: number;
  admin: Admin;
  trend_adjustment: number;
  n_members: number;
  n_employees: number;
  n_children_excluded: number;
  avg_age: number;
  group_age_factor_ee: number;
  all_member_avg_age_factor: number;
  effective_age_factor: number;
  tier_factors: { EE: number; ECH: number; ESP: number; FAM: number };
  plan_rates: Record<string, PlanRate>;
}

// ─── Factor table loading ─────────────────────────────────────────────────

// Default location: ./server/factor-tables.json relative to the process cwd.
const DEFAULT_TABLES_PATH = path.resolve(process.cwd(), "server", "factor-tables.json");

let _cachedTables: FactorTables | null = null;
let _cachedTablesPath: string | null = null;

export function loadFactorTables(p?: string): FactorTables {
  const tablesPath = p || DEFAULT_TABLES_PATH;
  if (_cachedTables && _cachedTablesPath === tablesPath) return _cachedTables;
  const raw = fs.readFileSync(tablesPath, "utf8");
  const parsed = JSON.parse(raw) as FactorTables;
  _cachedTables = parsed;
  _cachedTablesPath = tablesPath;
  return parsed;
}

export function reloadFactorTables(p?: string): FactorTables {
  _cachedTables = null;
  _cachedTablesPath = null;
  return loadFactorTables(p);
}

// ─── Date & age ───────────────────────────────────────────────────────────

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
  let years = eff.getFullYear() - dob.getFullYear();
  if (eff.getMonth() < dob.getMonth() ||
      (eff.getMonth() === dob.getMonth() && eff.getDate() < dob.getDate())) {
    years--;
  }
  return Math.max(0, years);
}

function relCode(rel: string): "EE" | "SP" | "CH" {
  const r = (rel || "").trim().toLowerCase();
  if (r === "ee" || r.startsWith("emp") || r === "subscriber" || r === "self" || r === "primary") return "EE";
  if (r === "sp" || r.startsWith("spo") || r.includes("partner")) return "SP";
  return "CH";
}

// ─── Area inference ────────────────────────────────────────────────────────

export function inferRatingAreaFromCensus(census: CensusMember[]): RatingArea {
  for (const m of census) {
    if (relCode(m.relationship) === "EE" && m.state) {
      return inferRatingArea(m.state, m.zip);
    }
  }
  for (const m of census) {
    if (m.state || m.zip) return inferRatingArea(m.state, m.zip);
  }
  return "Alabama Other Area";
}

// ─── Factor lookups ────────────────────────────────────────────────────────

function ageFactor(tables: FactorTables, age: number): number {
  const direct = tables.age_factors[String(age)];
  if (typeof direct === "number") return direct;
  const ages = Object.keys(tables.age_factors).map(k => parseInt(k, 10)).sort((a, b) => a - b);
  if (!ages.length) return 1;
  if (age >= ages[ages.length - 1]) return tables.age_factors[String(ages[ages.length - 1])];
  let best = ages[0];
  for (const a of ages) if (a <= age) best = a;
  return tables.age_factors[String(best)];
}

function areaFactor(tables: FactorTables, area: string): number {
  const v = tables.area_factors[area];
  if (typeof v === "number") return v;
  const oos = tables.area_factors["Out-of-State"];
  return typeof oos === "number" ? oos : 1.08;
}

function trendAdjustment(tables: FactorTables, base: Date, eff: Date): number {
  // xlsm uses /365 (not /365.25): (1+trend)^((eff-base)/365)
  const days = (eff.getTime() - base.getTime()) / (1000 * 60 * 60 * 24);
  const years = days / 365;
  return Math.pow(1 + (tables.trend_rate ?? 0.07), years);
}

// ─── Pricing ──────────────────────────────────────────────────────────────

type EnrichedMember = CensusMember & {
  _dob: Date;
  _rel: "EE" | "SP" | "CH";
  _age: number;
  _ageFactor: number;
  _included: boolean;   // false when excluded by DepExcld cap
};

/**
 * Apply the xlsm DepExcld pivot rule:
 * within each family (matched by last name), if >3 children have age ≤20,
 * keep only the 3 OLDEST; remaining children are marked excluded and their
 * age factors drop out of the composite calculation.
 *
 * Returns total count of children excluded.
 */
function applyDepExcldCap(members: EnrichedMember[]): number {
  const byFamily = new Map<string, EnrichedMember[]>();
  for (const m of members) {
    const key = (m.lastName ?? "").trim().toLowerCase() || `__ee_${members.indexOf(m)}`;
    if (!byFamily.has(key)) byFamily.set(key, []);
    byFamily.get(key)!.push(m);
  }
  let excluded = 0;
  for (const fam of Array.from(byFamily.values())) {
    const cappedChildren = fam.filter((m: EnrichedMember) => m._rel === "CH" && m._age <= 20);
    if (cappedChildren.length <= 3) continue;
    // Sort descending by age; ties broken by dob (older dob first).
    cappedChildren.sort((a: EnrichedMember, b: EnrichedMember) => {
      if (b._age !== a._age) return b._age - a._age;
      return a._dob.getTime() - b._dob.getTime();
    });
    const keep = new Set(cappedChildren.slice(0, 3));
    for (const c of cappedChildren) {
      if (!keep.has(c)) {
        c._included = false;
        excluded++;
      }
    }
  }
  return excluded;
}

export function priceGroup(
  input: PriceGroupInput,
  tablesOverride?: FactorTables,
): PricingResult {
  const tables = tablesOverride || loadFactorTables();
  const eff = parseDate(input.effectiveDate);
  const baseDate = parseDate(
    input.baseRateDate ?? tables.base_rate_date ?? "2025-01-01",
  );
  const admin = input.admin ?? "EBPA";

  const area: RatingArea = !input.ratingArea || input.ratingArea === "auto"
    ? inferRatingAreaFromCensus(input.census)
    : input.ratingArea;

  const areaF = areaFactor(tables, area);
  const trend = trendAdjustment(tables, baseDate, eff);
  const tier = tables.tier_factors_default;

  const members: EnrichedMember[] = input.census.map(m => {
    const _dob = parseDate(m.dob);
    const _age = ageAsOf(_dob, eff);
    return {
      ...m,
      _dob,
      _rel: relCode(m.relationship),
      _age,
      _ageFactor: ageFactor(tables, _age),
      _included: true,
    };
  });
  const employees = members.filter(m => m._rel === "EE");
  if (employees.length === 0) {
    throw new Error("Census has no employees; cannot compute composite rate");
  }

  // Apply xlsm DepExcld cap (keep 3 oldest children age ≤20 per family)
  const childrenExcluded = applyDepExcldCap(members);

  // EE-only age factors (informational)
  const eeAgeFactors = employees.map(m => m._ageFactor);
  const groupEEAgeFactor =
    eeAgeFactors.reduce((s, x) => s + x, 0) / eeAgeFactors.length;

  // All-member age factors (informational, pre-cap mean)
  const allAvgFactor =
    members.reduce((s, m) => s + m._ageFactor, 0) / members.length;

  const avgAge =
    members.reduce((s, m) => s + m._age, 0) / members.length;

  // Household tier assignment. Each Employee opens a household; subsequent
  // non-Employee rows attach to the prior Employee. Matches xlsm Member Rates
  // aggregation (Σ member_age_factor_included / Σ employee_household_tier).
  type Household = { tierFactor: number };
  const households: Household[] = [];
  let curHH: EnrichedMember[] = [];
  const closeHH = () => {
    if (!curHH.length) return;
    const ee = curHH.find(x => x._rel === "EE");
    if (!ee) return;
    const hasSP = curHH.some(x => x._rel === "SP");
    const hasCH = curHH.some(x => x._rel === "CH");
    let tf: number;
    if (hasSP && hasCH) tf = tier.FAM;
    else if (hasSP)     tf = tier.ESP;
    else if (hasCH)     tf = tier.ECH;
    else                tf = tier.EE;
    households.push({ tierFactor: tf });
  };
  for (const m of members) {
    if (m._rel === "EE") { closeHH(); curHH = [m]; }
    else curHH.push(m);
  }
  closeHH();

  const sumTierFactors =
    households.reduce((s, h) => s + h.tierFactor, 0) || 1;

  // Composite age factor uses ONLY included members (DepExcld-capped).
  const sumIncludedAgeFactors = members
    .filter(m => m._included)
    .reduce((s, m) => s + m._ageFactor, 0);
  const effectiveAgeFactor = sumIncludedAgeFactors / sumTierFactors;

  // PHIC aggregate stop-loss loading. xlsm stores as phic_stoploss = 1.2 (mult);
  // loading = 1.2 − 1 = 0.20 applied as (claims × trend) × (1 + 0.20).
  const phicStoploss = tables.phic_stoploss ?? 1.2;
  const phicLoading = phicStoploss - 1.0;

  // Fixed-expense grossup matches xlsm Rate Summary All:
  //   Monthly Rate = (claims + SL) / (1 − fixed_expense_pct)
  const fixedExpPct = tables.fixed_expense_pct ?? 0.2905;
  const grossup = 1 / (1 - fixedExpPct);

  const plan_rates: Record<string, PlanRate> = {};
  for (const [plan, comps] of Object.entries(tables.plan_base_pmpm_6to1)) {
    // Prefer authoritative claims_unadjusted (xlsm Plan Base Rates!B).
    // Fall back to total_margin / phic_stoploss for old factor tables.
    const claimsU = (typeof comps.claims_unadjusted === "number" && comps.claims_unadjusted > 0)
      ? comps.claims_unadjusted
      : (typeof comps.total_margin === "number" ? comps.total_margin / phicStoploss : 0);
    if (!(claimsU > 0)) continue;

    // xlsm Plan Base Rates!C = claims × trend × UW_adj × Verikai_adj
    // (UW_adj and Verikai_adj are 1.0 in current rater, left explicit for
    // future overrides.)
    const claimsTrended = claimsU * trend;
    // xlsm Plan Base Rates!E = C × phic_loading (0.20)
    // Total claims used = claims_trended × (1 + phic_loading)
    const claimsWithSL = claimsTrended * (1 + phicLoading);

    // ee_pre_expense = claimsWithSL × composite_factor × area_factor
    const eePre = claimsWithSL * effectiveAgeFactor * areaF;
    // ee_rate = ee_pre_expense / (1 − fixed_expense_pct)
    const ee = eePre * grossup;

    plan_rates[plan] = {
      EE: round2(ee),
      EC: round2(ee * (tier.ECH / tier.EE)),
      ES: round2(ee * (tier.ESP / tier.EE)),
      EF: round2(ee * (tier.FAM / tier.EE)),
    };
  }

  return {
    engine_version: "1.3",
    factor_tables_version: tables.version,
    factor_tables_sha256: tables.source_sha256,
    group: input.group,
    effective_date: eff.toISOString().slice(0, 10),
    rating_area: area,
    area_factor: areaF,
    admin,
    trend_adjustment: round5(trend),
    n_members: members.length,
    n_employees: employees.length,
    n_children_excluded: childrenExcluded,
    avg_age: round2(avgAge),
    group_age_factor_ee: round5(groupEEAgeFactor),
    all_member_avg_age_factor: round5(allAvgFactor),
    effective_age_factor: round5(effectiveAgeFactor),
    tier_factors: tier,
    plan_rates,
  };
}

function round2(x: number): number { return Math.round(x * 100) / 100; }
function round5(x: number): number { return Math.round(x * 1e5) / 1e5; }

// ─── CensusEntry (Drizzle schema) adapter ─────────────────────────────────

/** Convert the Drizzle `census_entries` row shape into the engine's
 *  CensusMember shape. */
export function censusEntriesToMembers(rows: CensusEntry[]): CensusMember[] {
  return rows.map(r => ({
    relationship: r.relationship,
    firstName: r.firstName,
    lastName: r.lastName,
    dob: r.dateOfBirth,
    sex: r.gender,
    state: null,            // not stored on census_entries in current schema
    zip: r.zipCode || null,
  }));
}
