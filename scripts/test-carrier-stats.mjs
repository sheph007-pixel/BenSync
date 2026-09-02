// Carrier stats report parser: the shape Employee Navigator exports, with a
// total row, dollar strings and a stray blank row.
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseCarrierStats } from "../server/carrier-stats.js";

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.aoa_to_sheet([
    ["Carrier", "Eligible Employees", "Enrolled Employees", "Companies", "Plans", "Employee Costs", "Plan Costs"],
    ["Blue Cross Blue Shield of Alabama", "868", "239", "8", "21", "109016.78", "224085.47"],
    ["EBPA", "2555", "992", "53", "166", "253691.48", "857600.75"],
    [],
    ["Guardian", "3872", "2430", "72", "732", "109619.93", "151848.02"],
    ["HealthEZ", "1613", "526", "20", "52", "$157,448.19", "$372,924.33"],
    ["Flores & Associates", "262", "28", "2", "3", "0.0", "0.0"],
    ["-- Total --", "0", "0", "0", "0", "646022.23", "1630857.96"],
  ]),
  "Output",
);
const buf = XLSX.write(wb, { type: "buffer", bookType: "xls" });
const out = parseCarrierStats(buf, "carrier_stats_report_2026_09_02.xls");

assert.equal(out.reportDate, "2026-09-02");
assert.equal(out.rows.length, 5, "five carriers, total row separated");
const ebpa = out.rows.find((r) => r.carrier === "EBPA");
assert.deepEqual(ebpa, { carrier: "EBPA", eligible: 2555, enrolled: 992, companies: 53, plans: 166, employeeCosts: 253691.48, planCosts: 857600.75 });
const hez = out.rows.find((r) => r.carrier === "HealthEZ");
assert.equal(hez.planCosts, 372924.33, "dollar strings read as numbers");
assert.deepEqual(out.total, { employeeCosts: 646022.23, planCosts: 1630857.96 });
assert.throws(() => parseCarrierStats(Buffer.from("not a spreadsheet at all"), "x.xls"), /Could not open|Carrier/);

console.log("carrier-stats: all assertions passed", { rows: out.rows.length, groupHealth: ebpa.enrolled + hez.enrolled, monthly: ebpa.planCosts + hez.planCosts });
