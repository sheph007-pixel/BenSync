/**
 * SAMPLE CENSUS parity test. Expected (per actuary xlsm):
 *   Deluxe Platinum EE = $760.75
 *   Freedom Bronze EE = $385.39
 */
import fs from "fs";
import Papa from "papaparse";
import { priceGroup, loadFactorTables, type CensusMember } from "./rate-engine";

const CSV = process.argv[2] || "/tmp/SAMPLE_CENSUS.csv";
const txt = fs.readFileSync(CSV, "utf8");
const rows = (Papa.parse<Record<string,string>>(txt, { header: true, skipEmptyLines: true }).data || []) as Record<string,string>[];
const members: CensusMember[] = rows
  .filter(r => r["Relationship"] && r["DOB"])
  .map(r => ({
    relationship: r["Relationship"]!.trim(),
    firstName: r["First Name"]?.trim(),
    lastName: r["Last Name"]?.trim(),
    dob: r["DOB"]!.trim(),
    sex: r["Sex"]?.trim() || null,
    state: "AL",
    zip: r["Zip"]?.trim() || null,
  }));

loadFactorTables();
const out = priceGroup({
  census: members,
  effectiveDate: "2026-04-01",
  ratingArea: "Birmingham",
  admin: "EBPA",
  group: "SAMPLE CENSUS",
});

const dp = out.plan_rates["Deluxe Platinum"];
const fb = out.plan_rates["Freedom Bronze"];

console.log(JSON.stringify({
  engine_version: out.engine_version,
  n_members: out.n_members,
  n_employees: out.n_employees,
  n_children_excluded: out.n_children_excluded,
  effective_age_factor: out.effective_age_factor,
  trend_adjustment: out.trend_adjustment,
  area_factor: out.area_factor,
  deluxe_platinum: dp,
  freedom_bronze: fb,
}, null, 2));

const dpTarget = 760.75;
const fbTarget = 385.39;
const dpOk = Math.abs(dp.EE - dpTarget) < 0.02;
const fbOk = Math.abs(fb.EE - fbTarget) < 0.02;
console.log(`\nDeluxe Platinum EE: got $${dp.EE}  target $${dpTarget}  ${dpOk ? "OK" : "FAIL"}`);
console.log(`Freedom Bronze  EE: got $${fb.EE}  target $${fbTarget}  ${fbOk ? "OK" : "FAIL"}`);
process.exit(dpOk && fbOk ? 0 : 1);
