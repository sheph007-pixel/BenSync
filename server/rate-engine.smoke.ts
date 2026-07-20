/**
 * Parity smoke test for the rate engine.
 *
 * Prices a directory of AdHoc census CSVs and, optionally, compares against
 * known-good priced JSON outputs from the reference Python engine.
 *
 * Usage:
 *   npx tsx server/rate-engine.smoke.ts /path/to/samples/       # just print rates
 *   npx tsx server/rate-engine.smoke.ts /path/to/samples/ /path/to/py-outputs/
 *
 *   - /path/to/samples:   directory of AdHocReport*.csv files
 *   - /path/to/py-outputs: optional dir of <slug>.json files produced by the
 *                         Python engine (same order as samples, matched by
 *                         filename stem).
 */
import fs from "fs";
import path from "path";
import Papa from "papaparse";
import {
  priceGroup,
  inferRatingAreaFromCensus,
  loadFactorTables,
  type CensusMember,
} from "./rate-engine";

function parseAdhoc(csvPath: string): { members: CensusMember[]; company: string } {
  const txt = fs.readFileSync(csvPath, "utf8");
  const res = Papa.parse<Record<string, string>>(txt, {
    header: true,
    skipEmptyLines: true,
  });
  const rows = (res.data || []) as Record<string, string>[];
  const members: CensusMember[] = [];
  let company = "";
  for (const r of rows) {
    if (!company && r["Company Name"]) company = String(r["Company Name"]).trim();
    const rel = String(r["Relationship"] || "").trim();
    const dob = String(r["DOB"] || "").trim();
    if (!rel || !dob) continue;
    members.push({
      relationship: rel,
      firstName: r["First Name"]?.trim(),
      lastName: r["Last Name"]?.trim(),
      dob,
      sex: r["Sex"]?.trim() || null,
      state: r["State"]?.trim() || null,
      zip: r["Zip"]?.trim() || null,
    });
  }
  return { members, company };
}

function compare(ts: any, py: any, tag: string): number {
  let diffs = 0;
  const checks: Array<[string, number, number]> = [
    ["n_members", ts.n_members, py.n_members],
    ["n_employees", ts.n_employees, py.n_employees],
    ["avg_age", ts.avg_age, py.avg_age],
    ["group_age_factor_ee", ts.group_age_factor_ee, py.group_age_factor_ee],
    ["area_factor", ts.area_factor, py.area_factor],
    ["trend_adjustment", ts.trend_adjustment, py.trend_adjustment],
  ];
  for (const [k, a, b] of checks) {
    if (typeof a === "number" && typeof b === "number" && Math.abs(a - b) > 1e-4) {
      console.log(`  DIFF ${tag} ${k}: ts=${a} py=${b}`);
      diffs++;
    }
  }
  for (const plan of Object.keys(py.plan_rates || {})) {
    const tp = ts.plan_rates[plan];
    const pp = py.plan_rates[plan];
    if (!tp) { console.log(`  MISSING plan ${plan}`); diffs++; continue; }
    for (const tier of ["EE", "EC", "ES", "EF"] as const) {
      const d = Math.abs(tp[tier] - pp[tier]);
      if (d > 0.01) {
        console.log(`  DIFF ${tag} ${plan} ${tier}: ts=${tp[tier]} py=${pp[tier]} (delta ${d.toFixed(4)})`);
        diffs++;
      }
    }
  }
  return diffs;
}

function stem(f: string): string {
  return path.basename(f).replace(/\.csv$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

(function main() {
  const samplesDir = process.argv[2];
  const pyDir = process.argv[3];
  if (!samplesDir) {
    console.error("Usage: npx tsx server/rate-engine.smoke.ts <samples-dir> [<py-outputs-dir>]");
    process.exit(2);
  }
  loadFactorTables();

  const csvs = fs.readdirSync(samplesDir).filter(f => f.toLowerCase().endsWith(".csv")).sort();
  if (csvs.length === 0) {
    console.error(`No CSVs in ${samplesDir}`);
    process.exit(2);
  }

  let totalDiffs = 0;
  for (const csv of csvs) {
    const { members, company } = parseAdhoc(path.join(samplesDir, csv));
    if (members.length === 0) continue;
    const area = inferRatingAreaFromCensus(members);
    const ts = priceGroup({
      census: members,
      effectiveDate: process.env.EFFECTIVE_DATE || "2026-06-01",
      ratingArea: area,
      admin: "EBPA",
      group: company || csv,
    });
    const sample = ts.plan_rates["AL Healthy 500"];
    const tag = (company || csv).slice(0, 22).padEnd(22);
    let diffs = 0;
    if (pyDir) {
      const pyPath = path.join(pyDir, `${stem(csv)}.json`);
      if (fs.existsSync(pyPath)) {
        diffs = compare(ts, JSON.parse(fs.readFileSync(pyPath, "utf8")), tag.trim());
        totalDiffs += diffs;
      }
    }
    console.log(
      `${tag} n=${ts.n_members}  area=${ts.rating_area.padEnd(20)} ` +
      `EE=$${sample?.EE.toFixed(2) ?? "-"}  EF=$${sample?.EF.toFixed(2) ?? "-"}` +
      (pyDir ? `  diffs=${diffs}` : "")
    );
  }

  if (pyDir) {
    console.log(`\nTotal diffs: ${totalDiffs}  (${totalDiffs === 0 ? "PARITY OK" : "MISMATCH"})`);
    if (totalDiffs > 0) process.exit(1);
  }
})();
