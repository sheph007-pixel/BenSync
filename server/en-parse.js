// Parser for Employee Navigator Data API XML exports.
//
// Produces the same shape the portal already consumes, so an imported group is
// indistinguishable from one that came out of the original census build.
//
// Deliberate choices, each of which changes the numbers:
//   - Only Benefit=Medical enrollments count. The exports also carry Dental,
//     Vision, Life, Accident and Cancer.
//   - Only rows that are EmploymentStatus=Active AND have no EndDate. A
//     terminated employee or a closed enrollment is not current coverage.
//   - CoverageLevel is used verbatim as the tier; EN's wording already matches
//     the portal's ("Employee + Child(ren)" etc).
//   - A tier's rate is PlanCost for that tier, which EN bills uniformly per
//     plan+tier. Tiers nobody is enrolled in get no rate here; the portal
//     calculates those at the program factors and marks them "calc.".

const TIER_ORDER = ["Employee", "Employee + Spouse", "Employee + Child(ren)", "Employee + Family"];
const TIER_KEY = {
  "Employee": "EE",
  "Employee + Spouse": "ES",
  "Employee + Child(ren)": "EC",
  "Employee + Family": "FAM",
};

const text = (xml, tag) => {
  const m = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml);
  return m ? decode(m[1]).trim() : null;
};
const decode = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
const blocks = (xml, tag) => xml.match(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, "g")) || [];
const isNil = (xml, tag) => new RegExp(`<${tag}[^>]*xsi:nil="true"`).test(xml);

/** Whole years between a date of birth and an as-of date. */
function ageAt(dob, asOf) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d)) return null;
  let a = asOf.getFullYear() - d.getFullYear();
  const m = asOf.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && asOf.getDate() < d.getDate())) a--;
  return a;
}

/** EN plan names carry the year ("HealthEZ Saver HSA 2026"); the portal doesn't. */
const cleanPlan = (p) => (p || "").replace(/\s+(19|20)\d{2}\s*$/, "").trim();

const round2 = (n) => Math.round(n * 100) / 100;

export function parseEmployeeNavigatorXml(xml) {
  if (typeof xml !== "string" || !/<Employee>/.test(xml)) {
    throw new Error("This does not look like an Employee Navigator XML export.");
  }

  const companyBlock = (blocks(xml, "Company")[0] || xml).slice(0, 4000);
  const name = text(companyBlock, "Name") || text(companyBlock, "Identifier");
  if (!name) throw new Error("No company name found in the export.");

  // The export carries a <Plans> catalog naming the carrier for each plan.
  // That is where the TPA comes from; the enrollment rows themselves do not
  // name a carrier.
  const planCarrier = new Map();
  const catalog = blocks(xml, "Plans")[0];
  if (catalog) {
    for (const pl of blocks(catalog, "Plan")) {
      if (text(pl, "Benefit") !== "Medical") continue;
      const pn = cleanPlan(text(pl, "PlanName"));
      const carrier = text(pl, "Carrier");
      if (pn && carrier) planCarrier.set(pn, carrier);
    }
  }

  const employees = blocks(xml, "Employee");
  const members = [];
  let pyStart = null;
  let pyEnd = null;
  const carriers = new Map();

  for (const emp of employees) {
    if (text(emp, "EmploymentStatus") !== "Active") continue;

    const medical = blocks(emp, "Enrollment").filter(
      (en) => text(en, "Benefit") === "Medical" && isNil(en, "EndDate"),
    );
    if (!medical.length) continue;

    // Dependents are nested in the employee record; only their ages are used.
    const deps = blocks(emp, "Dependent").map((d) => ({
      rel: text(d, "Relationship"),
      dob: text(d, "DOB"),
    }));

    for (const en of medical) {
      const tier = text(en, "CoverageLevel");
      if (!TIER_KEY[tier]) continue;

      const starts = text(en, "PlanStarts");
      const ends = text(en, "PlanEnds");
      if (starts && (!pyStart || starts < pyStart)) pyStart = starts;
      if (ends && (!pyEnd || ends > pyEnd)) pyEnd = ends;

      const plan = cleanPlan(text(en, "Plan"));
      if (planCarrier.has(plan)) carriers.set(plan, planCarrier.get(plan));

      // Ages are as of the plan-year start, so they don't drift with the clock.
      const asOf = starts ? new Date(starts) : new Date();
      const num = (f) => {
        const v = text(en, f);
        return v == null || v === "" ? null : Number(v);
      };

      members.push({
        first: text(emp, "FirstName") || "",
        last: text(emp, "LastName") || "",
        gender: text(emp, "Gender") || null,
        age: ageAt(text(emp, "DOB"), asOf),
        zip: (text(emp, "ZIP") || "").split("-")[0] || null,
        tier,
        plan,
        premium: num("PlanCost"),
        employeeCost: num("EmployeeCost"),
        employerCost: num("EmployerCost"),
        spAges: deps.filter((d) => d.rel === "Spouse").map((d) => ageAt(d.dob, asOf)).filter((a) => a != null),
        chAges: deps.filter((d) => d.rel === "Child").map((d) => ageAt(d.dob, asOf)).filter((a) => a != null),
      });
    }
  }

  if (!members.length) {
    throw new Error("No active medical enrollments found in the export.");
  }

  // Rates and splits: EN bills one amount per plan + tier.
  const rates = {};
  const splitPlans = {};
  const planAgg = new Map();

  for (const m of members) {
    (rates[m.plan] = rates[m.plan] || {});
    if (m.premium != null && rates[m.plan][m.tier] == null) rates[m.plan][m.tier] = m.premium;

    if (m.employerCost != null && m.employeeCost != null && m.premium != null) {
      const sp = (splitPlans[m.plan] = splitPlans[m.plan] || {});
      if (!sp[m.tier]) sp[m.tier] = { total: m.premium, er: m.employerCost, ee: m.employeeCost };
    }

    const a = planAgg.get(m.plan) || { enrolled: 0, monthly: 0 };
    a.enrolled++;
    a.monthly += m.premium || 0;
    planAgg.set(m.plan, a);
  }

  const tiers = { EE: 0, ES: 0, EC: 0, FAM: 0 };
  members.forEach((m) => tiers[TIER_KEY[m.tier]]++);

  const plans = [...planAgg.entries()]
    .map(([plan, a]) => ({
      plan,
      tpa: carriers.get(plan) || "",
      enrolled: a.enrolled,
      monthly: round2(a.monthly),
    }))
    .sort((x, y) => y.enrolled - x.enrolled);

  const monthly = round2(members.reduce((s, m) => s + (m.premium || 0), 0));
  const lives =
    members.length + members.reduce((s, m) => s + m.spAges.length + m.chAges.length, 0);
  const tpa = plans[0] ? plans[0].tpa : "";

  // Strip the working fields the portal does not consume.
  const cleanMembers = members.map((m) => ({
    first: m.first,
    last: m.last,
    gender: m.gender,
    age: m.age,
    zip: m.zip,
    tier: m.tier,
    plan: m.plan,
    tpa: carriers.get(m.plan) || tpa,
    premium: m.premium,
    spAges: m.spAges,
    chAges: m.chAges,
  }));

  const day = (s) => (s ? s.slice(0, 10) : null);

  return {
    group: {
      name,
      city: text(companyBlock, "City"),
      state: text(companyBlock, "State") || text(companyBlock, "SitusState"),
      sic: text(companyBlock, "SICCode"),
      pyStart: day(pyStart),
      pyEnd: day(pyEnd),
      tpa,
      enrolled: members.length,
      lives,
      tiers,
      monthly,
      annual: round2(monthly * 12),
      plans,
      members: cleanMembers,
      rates,
    },
    split: Object.keys(splitPlans).length
      ? {
          source: `Employee Navigator XML import — employer/employee cost as configured in payroll`,
          plans: splitPlans,
        }
      : null,
    stats: {
      employeesInFile: employees.length,
      tierCounts: TIER_ORDER.reduce((o, t) => ({ ...o, [t]: members.filter((m) => m.tier === t).length }), {}),
      ratesFound: Object.values(rates).reduce((n, r) => n + Object.keys(r).length, 0),
      splitsFound: Object.values(splitPlans).reduce((n, r) => n + Object.keys(r).length, 0),
    },
  };
}
