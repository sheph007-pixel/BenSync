// Funding workbook: parse the AL/VT sheets with their (HEALTH) subsets, file
// invoices under groups by their participants' names, and summarise per group.
// Synthetic data only.
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseFunding, assignInvoices, summariseFunding, bandTier, nameKey } from "../server/funding.js";

const H = ["Invoice", "Org Name", "Family Id", "Participant", "Prod Id", "Start Date", "End Date", "Rate Band", "Volume", "Rate"];
const row = (inv, org, fid, who, prod, band, rate, start = "9/1/2026") => [inv, org, fid, who, prod, start, "", band, "1", String(rate)];

const al = [
  H,
  row("AL-1", "Acme Widgets 101-0001", "f1", "Smith, John", "EBPA PPO 2026", "Employee Only", 500),
  row("AL-1", "Acme Widgets 101-0001", "f2", "Jones, Mary", "EBPA PPO 2026", "Employee + Family", 1400),
  row("AL-1", "Acme Widgets 101-0001", "f3", "Brown, Al", "EBPA PPO 2026", "Employee Only", 500),
  row("AL-1", "Acme Widgets 101-0001", "f3", "Brown, Al", "EBPA PPO 2026", "Employee Only", -500, "8/15/2026"), // credit: termed, reversed
  row("AL-1", "Acme Widgets 101-0001", "f1", "Smith, John", "Guardian Dental", null, 40),
  row("AL-1", "Acme Widgets 101-0001", "f1", "Smith, John", "EBPA Complete Dental Plan 2026", "Employee Only", 41.67),
  row("AL-1", "Acme Widgets 101-0001", "f4", "Green, Pat", "EBPA PPO 2026", "Employee Only", 250), // half-month adjustment
  // Invoice with no one we know, but the billing org is the company name
  row("AL-2", "Beta Freight, In", "f9", "Nobody, Known", "EBPA HDHP 2026", "Employee + Spouse", 900),
  // Invoice nobody can place
  row("AL-3", "116", "f8", "Unknown, Person", "EBPA PPO 2026", "Employee Only", 500),
];
const alHealth = al.filter((r, i) => i === 0 || r[4].startsWith("EBPA")); // EN lists EBPA dental here too
const vt = [
  H,
  row("VT-1", "Gamma Labs", "g1", "Doe, Jane", "HealthEZ Plan A 2026", "Employee + Child(ren)", 800),
  row("VT-1", "Gamma Labs", "g2", "Roe, Rick", "HealthEZ Plan A 2026", "Employee Only", 450),
  row("VT-1", "Gamma Labs", "g1", "Doe, Jane", "VSP Vision", null, 12),
];
const vtHealth = vt.filter((r, i) => i === 0 || r[4].startsWith("HealthEZ"));

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(al), "AL");
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(alHealth), "AL (HEALTH)");
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(vt), "VT");
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(vtHealth), "VT (HEALTH)");
const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

const parsed = parseFunding(buf, "September_Funding_081526091426.xlsx");
assert.equal(parsed.month, "2026-09");
assert.equal(parsed.fileStamp, "2026-08-15");
assert.equal(parsed.lines.length, 12);
assert.equal(parsed.lines.find((l) => /Dental Plan/.test(l.product)).medical, false, "EBPA dental on the health sheet is still a line");
assert.equal(parsed.lines.filter((l) => l.medical).length, 9, "medical flag from the (HEALTH) sheets");
assert.equal(parsed.lines.find((l) => l.rate < 0).kind, "credit");
assert.equal(parsed.lines.filter((l) => l.kind === "current").length, 11, "everything else is this month's billing");
assert.equal(parsed.lines.find((l) => l.product === "Guardian Dental").medical, false);
assert.equal(parsed.lines.find((l) => l.rate < 0).rate, -500);

assert.equal(bandTier("Employee + Family"), "Employee + Family");
assert.equal(bandTier("EE + Spouse"), "Employee + Spouse");
assert.equal(bandTier("Employee Only"), "Employee");
assert.equal(nameKey("SMITH, John Jr."), "smith, john");

const groups = [
  { name: "Acme Widgets, LLC", members: [{ first: "John", last: "Smith" }, { first: "Mary", last: "Jones" }, { first: "Al", last: "Brown" }] },
  { name: "Beta Freight, Inc.", members: [{ first: "Someone", last: "Else" }] },
  { name: "Gamma Labs", members: [{ first: "Jane", last: "Doe" }, { first: "Rick", last: "Roe" }] },
];
const { byInvoice, unassigned } = assignInvoices(parsed.lines, groups);
assert.equal(byInvoice["AL-1"].group, "Acme Widgets, LLC");
assert.equal(byInvoice["AL-1"].by, "names");
assert.equal(byInvoice["AL-2"].group, "Beta Freight, Inc.", "truncated org name prefix-matches the group");
assert.equal(byInvoice["AL-2"].by, "org name");
assert.equal(byInvoice["VT-1"].group, "Gamma Labs");
assert.deepEqual(unassigned, ["AL-3"]);

const sum = summariseFunding(parsed.lines, byInvoice);
const acme = sum["Acme Widgets, LLC"];
assert.deepEqual(acme.invoices, ["AL-1"]);
assert.equal(acme.medical.participants, 4, "Smith, Jones, Brown, Green billed this month; the credit is August's");
assert.equal(acme.medical.monthly, 2650, "the month's own lines");
assert.equal(acme.medical.adjustments, -500);
assert.equal(acme.medical.credits, 1);
assert.equal(acme.medical.billed, 2150);
assert.equal(acme.other.monthly, 81.67);
assert.equal(acme.other.byProduct["EBPA Complete Dental Plan 2026"].lines, 1);
assert.equal(acme.totalMonthly, 2731.67);
assert.equal(acme.totalBilled, 2231.67);
const ppo = acme.medical.byPlan["EBPA PPO"];
assert.ok(ppo, "plan year stripped from the product");
assert.equal(ppo.byTier["Employee"].n, 3, "three current lines; the credit is an adjustment");
assert.equal(ppo.byTier["Employee"].adjustments, -500);
assert.equal(ppo.byTier["Employee"].rate, 500, "most common positive rate wins");
assert.deepEqual(ppo.byTier["Employee"].otherRates, [{ rate: 250, n: 1 }]);
assert.equal(ppo.byTier["Employee"].credits, 1);
assert.equal(ppo.byTier["Employee + Family"].rate, 1400);
const gamma = sum["Gamma Labs"];
assert.equal(gamma.medical.byPlan["HealthEZ Plan A"].byTier["Employee + Child(ren)"].rate, 800);
assert.equal(gamma.other.byProduct["VSP Vision"].monthly, 12);
assert.equal(sum["Beta Freight, Inc."].medical.byPlan["EBPA HDHP"].byTier["Employee + Spouse"].rate, 900);

assert.throws(() => parseFunding(Buffer.from("nope"), "x.xlsx"), /Could not open|funding workbook/);
const other = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(other, XLSX.utils.aoa_to_sheet([["a"], ["b"]]), "Sheet1");
assert.throws(() => parseFunding(XLSX.write(other, { type: "buffer", bookType: "xlsx" }), "x.xlsx"), /funding workbook/);

console.log("funding: all assertions passed", { lines: parsed.lines.length, current: parsed.lines.filter((l) => l.kind === "current").length, assigned: Object.values(byInvoice).filter((a) => a.group).length, unassigned });
