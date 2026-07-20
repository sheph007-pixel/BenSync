// Static plan-benefit descriptions (what each plan covers, deductibles,
// copays, allowances, etc.). Shared with the client so the Plan Details
// page and any future PDF export render the exact same copy. This file
// intentionally contains NO rates, rates live in benefits-rates.ts
// (dental/vision/supplemental) and in the rate engine (medical).
//
// Hand-transcribed from the five carrier-style comparison PDFs.
// Plan `key` values match the plan names used in the cockpit (Medical)
// and in DENTAL_PLANS / VISION_PLANS (benefits-rates.ts) so selected-
// plan highlighting on the Plan Details page can find the right column.

export const ALL_PLANS_INCLUDE =
  "All plans include: 24/7 virtual care, concierge support, and a Visa card to help pay for care.";

// ── Medical ──────────────────────────────────────────────────────────────
// Values are strings so we can keep "$150/day (1-5)", "No Charge After
// Deductible", "Free On App", "No Charge", "-", etc. exactly as shown.

export type MedicalPlanBenefits = {
  key: string;           // matches the server plan name used in the cockpit
  name: string;          // display name
  deductible: string;
  oopMax: string;
  preventiveCare: string;
  benefitsApp: string;
  visaCard: string;
  virtualPrimary: string;
  virtualMental: string;
  virtualUrgent: string;
  primaryCare: string;
  specialist: string;
  er: string;
  inpatient: string;
  outpatient: string;
  rxGeneric: string;
  rxBrandPreferred: string;
  rxBrandNonPreferred: string;
};

// "No Charge After Deductible", the post-deductible experience for every
// medical benefit under the HDHP / HSA-qualified plans.
const NC_AFTER_DED = "No Charge After Deductible";

export const MEDICAL_PLAN_DETAILS: MedicalPlanBenefits[] = [
  {
    key: "Deluxe Platinum", name: "Deluxe Platinum",
    deductible: "$100", oopMax: "$3,000",
    preventiveCare: "✓", benefitsApp: "✓", visaCard: "✓",
    virtualPrimary: "Free On App", virtualMental: "Free On App", virtualUrgent: "Free On App",
    primaryCare: "$20", specialist: "$30",
    er: "$150", inpatient: "$150/day (1-5)", outpatient: "$150",
    rxGeneric: "No Charge", rxBrandPreferred: "$30", rxBrandNonPreferred: "$60",
  },
  {
    key: "Choice Gold", name: "Choice Gold",
    deductible: "$500", oopMax: "$5,000",
    preventiveCare: "✓", benefitsApp: "✓", visaCard: "✓",
    virtualPrimary: "Free On App", virtualMental: "Free On App", virtualUrgent: "Free On App",
    primaryCare: "$35", specialist: "$50",
    er: "$200", inpatient: "$200/day (1-5)", outpatient: "$200",
    rxGeneric: "$15", rxBrandPreferred: "$40", rxBrandNonPreferred: "$60",
  },
  {
    key: "Basic Gold", name: "Basic Gold",
    deductible: "$1,000", oopMax: "$6,000",
    preventiveCare: "✓", benefitsApp: "✓", visaCard: "✓",
    virtualPrimary: "Free On App", virtualMental: "Free On App", virtualUrgent: "Free On App",
    primaryCare: "$40", specialist: "$60",
    er: "$250", inpatient: "$250/day (1-5)", outpatient: "$250",
    rxGeneric: "$15", rxBrandPreferred: "$50", rxBrandNonPreferred: "$100",
  },
  {
    key: "Preferred Silver", name: "Preferred Silver",
    deductible: "$2,000", oopMax: "$6,350",
    preventiveCare: "✓", benefitsApp: "✓", visaCard: "✓",
    virtualPrimary: "Free On App", virtualMental: "Free On App", virtualUrgent: "Free On App",
    primaryCare: "$40", specialist: "$60",
    er: "$300", inpatient: "$300/day (1-5)", outpatient: "$300",
    rxGeneric: "$15", rxBrandPreferred: "$60", rxBrandNonPreferred: "$100",
  },
  {
    key: "Enhanced Silver", name: "Enhanced Silver",
    deductible: "$3,000", oopMax: "$7,900",
    preventiveCare: "✓", benefitsApp: "✓", visaCard: "✓",
    virtualPrimary: "Free On App", virtualMental: "Free On App", virtualUrgent: "Free On App",
    primaryCare: "$40", specialist: "$65",
    er: "$400", inpatient: "$400/day (1-5)", outpatient: "$400",
    rxGeneric: "$15", rxBrandPreferred: "$75", rxBrandNonPreferred: "$100",
  },
  {
    key: "Classic Silver", name: "Classic Silver",
    deductible: "$4,000", oopMax: "$8,150",
    preventiveCare: "✓", benefitsApp: "✓", visaCard: "✓",
    virtualPrimary: "Free On App", virtualMental: "Free On App", virtualUrgent: "Free On App",
    primaryCare: "$40", specialist: "$70",
    er: "$450", inpatient: "$450/day (1-5)", outpatient: "$450",
    rxGeneric: "$15", rxBrandPreferred: "$75", rxBrandNonPreferred: "$100",
  },
  {
    key: "Saver HSA", name: "Saver HSA",
    deductible: "$6,450", oopMax: "$6,450",
    preventiveCare: "✓", benefitsApp: "✓", visaCard: "✓",
    // HDHP / HSA-qualified, everything pays after the deductible is met.
    virtualPrimary: NC_AFTER_DED, virtualMental: NC_AFTER_DED, virtualUrgent: NC_AFTER_DED,
    primaryCare: NC_AFTER_DED, specialist: NC_AFTER_DED,
    er: NC_AFTER_DED, inpatient: NC_AFTER_DED, outpatient: NC_AFTER_DED,
    rxGeneric: NC_AFTER_DED, rxBrandPreferred: NC_AFTER_DED, rxBrandNonPreferred: NC_AFTER_DED,
  },
  {
    key: "Elite Health", name: "Elite Health",
    deductible: "$1,000", oopMax: "$1,000",
    preventiveCare: "✓", benefitsApp: "✓", visaCard: "✓",
    virtualPrimary: "Free On App", virtualMental: "Free On App", virtualUrgent: "Free On App",
    primaryCare: "No Charge", specialist: "No Charge",
    er: NC_AFTER_DED, inpatient: NC_AFTER_DED, outpatient: NC_AFTER_DED,
    rxGeneric: "No Charge", rxBrandPreferred: "$75", rxBrandNonPreferred: "$100",
  },
  {
    key: "Premier Health", name: "Premier Health",
    deductible: "$3,000", oopMax: "$3,000",
    preventiveCare: "✓", benefitsApp: "✓", visaCard: "✓",
    virtualPrimary: "Free On App", virtualMental: "Free On App", virtualUrgent: "Free On App",
    primaryCare: "No Charge", specialist: "No Charge",
    er: NC_AFTER_DED, inpatient: NC_AFTER_DED, outpatient: NC_AFTER_DED,
    rxGeneric: "No Charge", rxBrandPreferred: "$75", rxBrandNonPreferred: "$100",
  },
  {
    key: "Select Health", name: "Select Health",
    deductible: "$5,000", oopMax: "$5,000",
    preventiveCare: "✓", benefitsApp: "✓", visaCard: "✓",
    virtualPrimary: "Free On App", virtualMental: "Free On App", virtualUrgent: "Free On App",
    primaryCare: "No Charge", specialist: "No Charge",
    er: NC_AFTER_DED, inpatient: NC_AFTER_DED, outpatient: NC_AFTER_DED,
    rxGeneric: "No Charge", rxBrandPreferred: "$75", rxBrandNonPreferred: "$100",
  },
  {
    key: "Core Health", name: "Core Health",
    deductible: "$9,000", oopMax: "$9,000",
    preventiveCare: "✓", benefitsApp: "✓", visaCard: "✓",
    virtualPrimary: "Free On App", virtualMental: "Free On App", virtualUrgent: "Free On App",
    primaryCare: "No Charge", specialist: "No Charge",
    er: NC_AFTER_DED, inpatient: NC_AFTER_DED, outpatient: NC_AFTER_DED,
    rxGeneric: "No Charge", rxBrandPreferred: "$75", rxBrandNonPreferred: "$100",
  },
  {
    key: "Freedom Platinum", name: "Freedom Platinum",
    deductible: "$100", oopMax: "$3,000",
    preventiveCare: "✓", benefitsApp: "✓", visaCard: "✓",
    virtualPrimary: "Free On App", virtualMental: "Free On App", virtualUrgent: "Free On App",
    primaryCare: "$20", specialist: "$30",
    er: "$150/day (1-5)", inpatient: "$150", outpatient: "$150",
    rxGeneric: "$10", rxBrandPreferred: "-", rxBrandNonPreferred: "-",
  },
  {
    key: "Freedom Gold", name: "Freedom Gold",
    deductible: "$500", oopMax: "$5,000",
    preventiveCare: "✓", benefitsApp: "✓", visaCard: "✓",
    virtualPrimary: "Free On App", virtualMental: "Free On App", virtualUrgent: "Free On App",
    primaryCare: "$35", specialist: "$50",
    er: "$200/day (1-5)", inpatient: "$200", outpatient: "$200",
    rxGeneric: "$10", rxBrandPreferred: "-", rxBrandNonPreferred: "-",
  },
  {
    key: "Freedom Silver", name: "Freedom Silver",
    deductible: "$2,000", oopMax: "$6,350",
    preventiveCare: "✓", benefitsApp: "✓", visaCard: "✓",
    virtualPrimary: "Free On App", virtualMental: "Free On App", virtualUrgent: "Free On App",
    primaryCare: "$40", specialist: "$60",
    er: "$300/day (1-5)", inpatient: "$300", outpatient: "$300",
    rxGeneric: "$10", rxBrandPreferred: "-", rxBrandNonPreferred: "-",
  },
  {
    key: "Freedom Bronze", name: "Freedom Bronze",
    deductible: "$8,550", oopMax: "$8,550",
    preventiveCare: "✓", benefitsApp: "✓", visaCard: "✓",
    virtualPrimary: "Free On App", virtualMental: "Free On App", virtualUrgent: "Free On App",
    primaryCare: "$35", specialist: "$50",
    er: NC_AFTER_DED, inpatient: NC_AFTER_DED, outpatient: NC_AFTER_DED,
    rxGeneric: "$10", rxBrandPreferred: "-", rxBrandNonPreferred: "-",
  },
];

// ── Dental ──────────────────────────────────────────────────────────────

export type DentalPlanBenefits = {
  key: string;
  name: string;
  deductible: string;
  annualMax: string;
  lifetimeOrthoMax: string;
  preventativePct: string;
  basicPct: string;
  majorPct: string;
  orthoPct: string;
};

export const DENTAL_PLAN_DETAILS: DentalPlanBenefits[] = [
  { key: "advantage-ortho", name: "Advantage Dental (w/ Ortho)",
    deductible: "$25", annualMax: "$2,500", lifetimeOrthoMax: "$2,500",
    preventativePct: "100%", basicPct: "80%", majorPct: "50%", orthoPct: "50%" },
  { key: "complete-ortho", name: "Complete Dental (w/ Ortho)",
    deductible: "$50", annualMax: "$1,500", lifetimeOrthoMax: "$1,500",
    preventativePct: "100%", basicPct: "80%", majorPct: "50%", orthoPct: "50%" },
  { key: "value-ortho", name: "Value Dental (w/ Ortho)",
    deductible: "$50", annualMax: "$1,000", lifetimeOrthoMax: "$1,000",
    preventativePct: "100%", basicPct: "80%", majorPct: "50%", orthoPct: "50%" },
  { key: "complete", name: "Complete Dental",
    deductible: "$50", annualMax: "$1,500", lifetimeOrthoMax: "-",
    preventativePct: "100%", basicPct: "80%", majorPct: "50%", orthoPct: "-" },
  { key: "value", name: "Value Dental",
    deductible: "$50", annualMax: "$1,000", lifetimeOrthoMax: "-",
    preventativePct: "100%", basicPct: "80%", majorPct: "50%", orthoPct: "-" },
  { key: "basic", name: "Basic Dental",
    deductible: "$50", annualMax: "$750", lifetimeOrthoMax: "-",
    preventativePct: "80%", basicPct: "80%", majorPct: "50%", orthoPct: "-" },
  { key: "choice", name: "Choice Dental",
    deductible: "$50", annualMax: "$750", lifetimeOrthoMax: "-",
    preventativePct: "100%", basicPct: "50%", majorPct: "-", orthoPct: "-" },
];

// ── Vision ──────────────────────────────────────────────────────────────

export type VisionPlanBenefits = {
  key: string;
  name: string;
  examCopay: string;
  materialCopay: string;
  examEvery: string;
  lensesEvery: string;
  framesEvery: string;
  framesAllowance: string;
  electiveContactsAllowance: string;
  necessaryContactsAllowance: string;
};

export const VISION_PLAN_DETAILS: VisionPlanBenefits[] = [
  { key: "premium", name: "Premium Vision",
    examCopay: "$20", materialCopay: "$20",
    examEvery: "12 Months", lensesEvery: "12 Months", framesEvery: "12 Months",
    framesAllowance: "$180 / $200", electiveContactsAllowance: "$180",
    necessaryContactsAllowance: "Covered after copay" },
  { key: "standard", name: "Standard Vision",
    examCopay: "$10", materialCopay: "$20",
    examEvery: "12 Months", lensesEvery: "12 Months", framesEvery: "24 Months",
    framesAllowance: "$150 / $170", electiveContactsAllowance: "$130",
    necessaryContactsAllowance: "Covered after copay" },
  { key: "value", name: "Value Vision",
    examCopay: "$20", materialCopay: "$20",
    examEvery: "12 Months", lensesEvery: "12 Months", framesEvery: "24 Months",
    framesAllowance: "$150 / $170", electiveContactsAllowance: "$150",
    necessaryContactsAllowance: "Covered after copay" },
  { key: "base", name: "Base Vision",
    examCopay: "$20", materialCopay: "$20",
    examEvery: "12 Months", lensesEvery: "24 Months", framesEvery: "24 Months",
    framesAllowance: "$130 / $150", electiveContactsAllowance: "-",
    necessaryContactsAllowance: "Covered after copay" },
];

// ── Supplemental ─────────────────────────────────────────────────────────
// Coverage amounts (benefit details) for voluntary products, no rates.
// Hospital is broken out into its own comparison because it's the only
// supplemental product that varies by plan; the others are a single
// coverage description.

export type SupplementalCoverage = {
  key: string;
  name: string;
  coverage: string;      // one-line description of what the benefit pays
  note?: string;
};

export const SUPPLEMENTAL_COVERAGE: SupplementalCoverage[] = [
  { key: "life_add", name: "Voluntary Life / AD&D",
    coverage: "$100,000 Employee / $50,000 Spouse / $10,000 Child(ren)",
    note: "Rates based on age." },
  { key: "std", name: "Voluntary Short-Term Disability",
    coverage: "$500 weekly benefit",
    note: "Employee only. Rates based on age." },
  { key: "accident", name: "Voluntary Accident",
    coverage: "Fixed-indemnity accident benefits for covered injuries.",
    note: "Composite rates, see Supplemental in your quote." },
  { key: "cancer", name: "Voluntary Cancer",
    coverage: "Fixed-indemnity cancer benefits including diagnosis and treatment.",
    note: "Composite rates, see Supplemental in your quote." },
  { key: "critical", name: "Voluntary Critical Illness",
    coverage: "$10,000 Employee / $5,000 Spouse / $2,500 Child(ren)",
    note: "Rates based on age." },
];

export type HospitalPlanBenefits = {
  key: string;
  name: string;
  inpatientAdmission: string;
  erUrgentCare: string;
  surgery: string;
};

export const HOSPITAL_PLAN_DETAILS: HospitalPlanBenefits[] = [
  { key: "choice", name: "Choice Plan",
    inpatientAdmission: "$500 + $200 / day",
    erUrgentCare: "$200 ER / $50 Urgent Care",
    surgery: "Up to $500" },
  { key: "basic", name: "Basic Plan",
    inpatientAdmission: "$1,000 + $250 / day",
    erUrgentCare: "$300 ER / $75 Urgent Care",
    surgery: "Up to $1,000" },
  { key: "preferred", name: "Preferred Plan",
    inpatientAdmission: "$2,000 + $300 / day",
    erUrgentCare: "$400 ER / $100 Urgent Care",
    surgery: "Up to $1,500" },
  { key: "enhanced", name: "Enhanced Plan",
    inpatientAdmission: "$3,000 + $400 / day",
    erUrgentCare: "$500 ER / $150 Urgent Care",
    surgery: "Up to $2,000" },
];
