// Every active medical enrollment must count, whatever Employee Navigator
// called its coverage level, and an enrollment only stops counting once it
// has actually ended. Run: node scripts/test-en-tiers.mjs
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { parseEnStream, tierKeyOf } from "../server/en-parse.js";

// Level spellings seen in the wild → tier.
for (const [level, key] of [
  ["Employee", "EE"], ["Employee Only", "EE"], ["EE", "EE"], ["Individual", "EE"],
  ["Employee + Spouse", "ES"], ["Employee + Domestic Partner", "ES"], ["Employee & Spouse", "ES"], ["Employee + 1", "ES"],
  ["Employee + Child(ren)", "EC"], ["Employee + Child", "EC"], ["Employee + Children", "EC"],
  ["Employee + Family", "FAM"], ["Family", "FAM"], ["Employee + Dependents", "FAM"], ["Employee + Spouse + Child", "FAM"],
  ["", null], ["???", null],
]) assert.equal(tierKeyOf(level), key, `tier for "${level}"`);

const enrollment = (o) => `
        <Enrollment>
          <Benefit>Medical</Benefit>
          <Plan>${o.plan || "EBPA Preferred Silver 2026"}</Plan>
          <CoverageLevel>${o.tier}</CoverageLevel>
          <PlanStarts>2026-01-01T00:00:00</PlanStarts>
          <PlanEnds>2026-12-31T00:00:00</PlanEnds>
          ${o.end === "omit" ? "" : o.end ? `<EndDate>${o.end}</EndDate>` : `<EndDate xsi:nil="true" />`}
          <PlanCost>${o.cost}</PlanCost>
          <EmployeeCost>100</EmployeeCost>
          <EmployerCost>${o.cost - 100}</EmployerCost>
        </Enrollment>`;
const employee = (first, ens) => `
      <Employee>
        <FirstName>${first}</FirstName><LastName>T</LastName><Gender>M</Gender>
        <DOB>1985-01-01T00:00:00</DOB><ZIP>35203</ZIP>
        <EmploymentStatus>Active</EmploymentStatus>
        <Enrollments>${ens.map(enrollment).join("")}</Enrollments>
        <Dependents></Dependents>
      </Employee>`;

const nextYear = new Date(Date.now() + 200 * 86400e3).toISOString().slice(0, 10) + "T00:00:00";
const xml = `<?xml version="1.0" encoding="utf-8"?>
<ArrayOfCompany xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<Company>
  <Identifier>T2</Identifier><Name>Tiers Co</Name>
  <Contacts></Contacts><Classes></Classes>
  <Plans>
    <Plan><Benefit>Medical</Benefit><PlanName>EBPA Preferred Silver 2026</PlanName><Carrier>EBPA</Carrier></Plan>
    <Plan><Benefit>Medical</Benefit><PlanName>EBPA  Deluxe Platinum</PlanName><Carrier>EBPA</Carrier></Plan>
  </Plans>
  <Employees>
    ${employee("Ann", [{ tier: "Employee Only", cost: 500 }])}
    ${employee("Bob", [{ tier: "Employee + Child", cost: 900 }])}
    ${employee("Cal", [{ tier: "Employee + Domestic Partner", cost: 1000 }])}
    ${employee("Dee", [{ tier: "Employee + Dependents", cost: 1400 }])}
    ${employee("Eve", [{ tier: "Something Odd", cost: 500 }])}
    ${employee("Fay", [{ tier: "Employee", cost: 500, end: "omit" }])}
    ${employee("Gus", [{ tier: "Employee", cost: 500, end: nextYear }])}
    ${employee("Hal", [{ tier: "Employee", cost: 500, end: "2026-03-31T00:00:00" }])}
    ${employee("Ivy", [{ tier: "Waived", plan: "Waive", cost: 0 }])}
    ${employee("Jon", [{ tier: "Employee", cost: 600, plan: "EBPA Deluxe Platinum 2026" }])}
  </Employees>
</Company>
</ArrayOfCompany>`;

const { companies, failures } = await parseEnStream(Readable.from([Buffer.from(xml)]));
assert.equal(failures.length, 0, JSON.stringify(failures));
const g = companies[0].group;
const names = g.members.map((m) => m.first).sort().join(",");
assert.equal(names, "Ann,Bob,Cal,Dee,Eve,Fay,Gus,Jon", "kept: every live enrollment; dropped: ended (Hal) and waived (Ivy)");
assert.equal(g.enrolled, 8);
assert.equal(g.monthly, 500 + 900 + 1000 + 1400 + 500 + 500 + 500 + 600, "premium counts every live enrollment");
const tierOf = (n) => g.members.find((m) => m.first === n).tier;
assert.equal(tierOf("Ann"), "Employee");
assert.equal(tierOf("Bob"), "Employee + Child(ren)");
assert.equal(tierOf("Cal"), "Employee + Spouse");
assert.equal(tierOf("Dee"), "Employee + Family");
assert.equal(tierOf("Eve"), "Employee", "unreadable level is filed as employee-only, not dropped");
assert.deepEqual(companies[0].stats.unmappedLevels, { "Something Odd": 1 });
// Rates come only from readable tiers: Eve's odd row must not set the EE rate
// ahead of Ann's. Both are $500 here, so check the mechanism on the ES tier.
assert.equal(g.rates["EBPA Preferred Silver"]["Employee + Spouse"], 1000);
// Jon's plan is spelled with a double space in the catalog: still gets the carrier.
assert.equal(g.plans.find((p) => p.plan === "EBPA Deluxe Platinum").tpa, "EBPA");
assert.equal(g.groupHealthMonthly, g.monthly, "all EBPA → all group health");
console.log("en-tiers: all assertions passed", { enrolled: g.enrolled, monthly: g.monthly, unmapped: companies[0].stats.unmappedLevels });
