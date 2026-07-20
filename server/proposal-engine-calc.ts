/**
 * Calculation module for proposal data, used by the PDF fallback generator.
 */
import type { Group, CensusEntry } from "@shared/schema";

// Risk factors by age band and gender
const RISK_TABLE: Record<string, { female: number; male: number }> = {
  "0-4": { female: 0.35, male: 0.40 },
  "5-9": { female: 0.30, male: 0.55 },
  "10-14": { female: 0.37, male: 0.46 },
  "15-19": { female: 0.62, male: 0.46 },
  "20-24": { female: 0.80, male: 0.46 },
  "25-29": { female: 0.92, male: 0.46 },
  "30-34": { female: 0.88, male: 0.45 },
  "35-39": { female: 0.81, male: 0.52 },
  "40-44": { female: 1.18, male: 0.77 },
  "45-49": { female: 1.03, male: 0.67 },
  "50-54": { female: 1.43, male: 1.20 },
  "55-59": { female: 1.22, male: 1.52 },
  "60-64": { female: 1.49, male: 1.99 },
  "65-69": { female: 3.81, male: 1.64 },
  "70+": { female: 10.36, male: 2.78 },
};

function calculateAge(dob: string): number {
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return 30;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return Math.max(0, age);
}

function getAgeBand(age: number): string {
  if (age <= 4) return "0-4";
  if (age <= 9) return "5-9";
  if (age <= 14) return "10-14";
  if (age <= 19) return "15-19";
  if (age <= 24) return "20-24";
  if (age <= 29) return "25-29";
  if (age <= 34) return "30-34";
  if (age <= 39) return "35-39";
  if (age <= 44) return "40-44";
  if (age <= 49) return "45-49";
  if (age <= 54) return "50-54";
  if (age <= 59) return "55-59";
  if (age <= 64) return "60-64";
  if (age <= 69) return "65-69";
  return "70+";
}

function getRiskFactor(ageBand: string, gender: string): number {
  const band = RISK_TABLE[ageBand];
  if (!band) return 1.0;
  return gender.toLowerCase() === "female" ? band.female : band.male;
}

export interface MemberRate {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  age: number;
  ageBand: string;
  gender: string;
  relationship: string;
  zipCode: string;
  riskFactor: number;
}

export interface ProposalData {
  group: Group;
  members: MemberRate[];
  summary: {
    totalLives: number;
    employees: number;
    spouses: number;
    children: number;
    averageAge: number;
    compositeRiskFactor: number;
    riskTier: string;
    maleCount: number;
    femaleCount: number;
    ageBandBreakdown: Record<string, { count: number; avgRisk: number; members: MemberRate[] }>;
  };
}

export function calculateProposalData(group: Group, census: CensusEntry[]): ProposalData {
  const members: MemberRate[] = census.map((entry) => {
    const age = calculateAge(entry.dateOfBirth);
    const ageBand = getAgeBand(age);
    return {
      firstName: entry.firstName,
      lastName: entry.lastName,
      dateOfBirth: entry.dateOfBirth,
      age,
      ageBand,
      gender: entry.gender,
      relationship: entry.relationship,
      zipCode: entry.zipCode,
      riskFactor: getRiskFactor(ageBand, entry.gender),
    };
  });

  const relOrder: Record<string, number> = { EE: 0, Employee: 0, SP: 1, Spouse: 1, CH: 2, Child: 2 };
  members.sort((a, b) => {
    const ra = relOrder[a.relationship] ?? 3;
    const rb = relOrder[b.relationship] ?? 3;
    if (ra !== rb) return ra - rb;
    return a.lastName.localeCompare(b.lastName);
  });

  let totalAge = 0, totalRisk = 0, employees = 0, spouses = 0, children = 0, maleCount = 0, femaleCount = 0;
  const ageBandBreakdown: Record<string, { count: number; totalRisk: number; members: MemberRate[] }> = {};

  for (const m of members) {
    totalAge += m.age;
    totalRisk += m.riskFactor;
    const rel = m.relationship.toUpperCase();
    if (rel === "EE" || rel === "EMPLOYEE") employees++;
    else if (rel === "SP" || rel === "SPOUSE") spouses++;
    else children++;
    if (m.gender.toLowerCase() === "male") maleCount++;
    else femaleCount++;
    if (!ageBandBreakdown[m.ageBand]) ageBandBreakdown[m.ageBand] = { count: 0, totalRisk: 0, members: [] };
    ageBandBreakdown[m.ageBand].count++;
    ageBandBreakdown[m.ageBand].totalRisk += m.riskFactor;
    ageBandBreakdown[m.ageBand].members.push(m);
  }

  const totalLives = members.length;
  const averageAge = totalLives > 0 ? totalAge / totalLives : 0;
  const compositeRiskFactor = totalLives > 0 ? totalRisk / totalLives : 0;
  let riskTier = "standard";
  if (compositeRiskFactor < 1.0) riskTier = "preferred";
  else if (compositeRiskFactor >= 1.5) riskTier = "high";

  const formattedBreakdown: Record<string, { count: number; avgRisk: number; members: MemberRate[] }> = {};
  for (const [band, data] of Object.entries(ageBandBreakdown)) {
    formattedBreakdown[band] = { count: data.count, avgRisk: data.count > 0 ? data.totalRisk / data.count : 0, members: data.members };
  }

  return {
    group,
    members,
    summary: { totalLives, employees, spouses, children, averageAge, compositeRiskFactor, riskTier, maleCount, femaleCount, ageBandBreakdown: formattedBreakdown },
  };
}
