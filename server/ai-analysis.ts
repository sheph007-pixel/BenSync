import { callOpenAIWithFallback } from "./ai-client";
import { OPENAI_MODEL_CHAIN } from "./model-config";

interface GroupAnalysisInput {
  riskScore: number;
  riskTier: string;
  averageAge: number;
  employeeCount: number;
  spouseCount: number;
  childrenCount: number;
  totalLives: number;
  maleCount: number;
  femaleCount: number;
  characteristics: any;
  companyName: string;
}

// Deterministic underwriter-flavored summary for the score-audit dialog.
// Uses the per-band data to point out specifically where the lift comes
// from, how the demographics compare to industry benchmarks, and the
// share of lives sitting in each tier band. Was previously an LLM call;
// gpt-4o-mini produced direction-reversed text ("higher older-band
// scores contribute positively to the overall score") because the
// prompt did not state the directionality. A template avoids that
// class of bug entirely and reads more like an underwriter's note
// than a generic confirmation.
//
// Benchmarks match the long-form `generateActuarialAnalysis` prompt
// below so the two surfaces tell a consistent story.
const BENCHMARK_MEDIAN_AGE = 36.7;
const BENCHMARK_FEMALE_PCT = 51;

export async function generateScoreReview(input: {
  companyName: string;
  riskScore: number;
  riskTier: string;
  totalLives: number;
  averageAge: number;
  femalePct: number;
  bands: { band: string; total: number; avgRiskScore: number }[];
}): Promise<string> {
  const score = input.riskScore;
  const scoreStr = score.toFixed(2);
  const populated = input.bands.filter((b) => b.total > 0);

  // Tier + threshold.
  let tierSentence: string;
  if (score < 1.0) {
    tierSentence = `Score ${scoreStr} places ${input.companyName} in the preferred tier (below 1.00).`;
  } else if (score < 1.5) {
    tierSentence = `Score ${scoreStr} places ${input.companyName} in the standard band (1.00 to 1.49).`;
  } else {
    tierSentence = `Score ${scoreStr} places ${input.companyName} at or above the 1.50 high-risk threshold.`;
  }

  // Demographic shape vs industry benchmarks. Calls direction explicitly
  // so the prose can't read as a vague "supports a preferred classification".
  const ageDelta = input.averageAge - BENCHMARK_MEDIAN_AGE;
  const ageNote =
    Math.abs(ageDelta) < 2
      ? `near the ${BENCHMARK_MEDIAN_AGE} industry median`
      : ageDelta > 0
        ? `above the ${BENCHMARK_MEDIAN_AGE} industry median`
        : `below the ${BENCHMARK_MEDIAN_AGE} industry median`;
  const femaleDelta = input.femalePct - BENCHMARK_FEMALE_PCT;
  const femaleStr = input.femalePct.toFixed(0);
  const femaleNote =
    Math.abs(femaleDelta) < 3
      ? `${femaleStr}% female near the ${BENCHMARK_FEMALE_PCT}% norm`
      : femaleDelta > 0
        ? `${femaleStr}% female versus a ${BENCHMARK_FEMALE_PCT}% norm`
        : `${femaleStr}% female below the ${BENCHMARK_FEMALE_PCT}% norm`;
  const lifeWord = input.totalLives === 1 ? "covered life" : "covered lives";
  const demoSentence =
    `Group of ${input.totalLives} ${lifeWord} at average age ${input.averageAge.toFixed(1)}, ${ageNote}, ${femaleNote}.`;

  // Lift sentence: the up-to-three populated bands with the highest
  // per-member scores, but only when they're meaningfully above 1.00.
  const topByScore = [...populated]
    .filter((b) => b.avgRiskScore >= 1.0)
    .sort((a, b) => b.avgRiskScore - a.avgRiskScore)
    .slice(0, 3);
  let liftSentence = "";
  if (topByScore.length > 0) {
    const parts = topByScore.map((b) => `${b.band} at ${b.avgRiskScore.toFixed(2)}`);
    const joined =
      parts.length === 1
        ? parts[0]
        : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
    liftSentence = ` The heaviest contributions come from ${joined}.`;
  }

  // Share of lives in high-risk vs preferred bands.
  let highCount = 0;
  let prefCount = 0;
  for (const b of populated) {
    if (b.avgRiskScore >= 1.5) highCount += b.total;
    else if (b.avgRiskScore < 1.0) prefCount += b.total;
  }
  const denom = input.totalLives > 0 ? input.totalLives : 1;
  const highPct = Math.round((highCount / denom) * 100);
  const prefPct = Math.round((prefCount / denom) * 100);
  const distSentence =
    ` ${highCount} of ${input.totalLives} lives (${highPct}%) sit in bands at or above the 1.50 high-risk line; ` +
    `${prefCount} (${prefPct}%) sit below 1.00 and pull the average down.`;

  return tierSentence + " " + demoSentence + liftSentence + distSentence;
}

export async function generateActuarialAnalysis(input: GroupAnalysisInput): Promise<string> {
  const femalePercentage = ((input.femaleCount / (input.maleCount + input.femaleCount || 1)) * 100).toFixed(1);
  const avgFamilySize = (input.totalLives / (input.employeeCount || 1)).toFixed(2);
  const dependencyRatio = (((input.spouseCount || 0) + (input.childrenCount || 0)) / (input.employeeCount || 1)).toFixed(2);

  const prompt = `You are an expert actuary analyzing a group health insurance census. Write a detailed analysis report for this employer group.

Company: ${input.companyName}
Risk Tier: ${input.riskTier}
Risk Score: ${input.riskScore} (1.0 = average, <1.0 = better than average, >1.0 = worse than average)

Group Composition:
- ${input.totalLives} total covered lives
- ${input.employeeCount} employees
- ${input.spouseCount || 0} spouses
- ${input.childrenCount || 0} children
- Average age: ${input.averageAge} years
- Employee average age: ${input.characteristics.averageEmployeeAge} years
- Gender mix: ${femalePercentage}% female
- Average family size: ${avgFamilySize}
- Dependency ratio: ${dependencyRatio}

Industry Benchmarks for Comparison:
- Median age: 36.69 years
- Average family size: 1.91
- Female percentage: 50.96%

Risk Factors Identified:
${input.characteristics.factors?.map((f: string) => `- ${f}`).join('\n') || 'None'}

Instructions:
1. Write in plain English at an 8th grade reading level - clear and easy to understand
2. DO NOT include any personally identifiable information (PHI) - only use aggregate statistics
3. NEVER use em dashes (-) - use hyphens (-) or rewrite sentences instead
4. Explain what makes this group's risk profile ${input.riskTier}
5. Compare their demographics to industry benchmarks and explain what that means for pricing
6. Discuss age distribution impact on expected healthcare utilization
7. Explain how the MARA (Multi-factor Actuarial Risk Analysis) model evaluated this group
8. Mention key actuarial factors like:
   - Expected medical cost trends for this age/gender mix
   - How family size impacts premiums
   - The significance of their dependency ratio
   - Why their risk score of ${input.riskScore} matters
9. If Preferred or Standard risk: Explain why they qualify for the BenSync program and potential savings
10. If High risk: Explain why fully-insured may be better and what factors drove the higher risk score
11. Keep it professional but conversational - like an expert advisor explaining to a business owner
12. Focus on what this means for THEM - not generic insurance information
13. Length: 3-4 paragraphs, roughly 250-350 words total

Write ONLY the analysis text. No preamble, no "Here's the analysis" - just start with the analysis itself.`;

  try {
    const completion = await callOpenAIWithFallback({
      messages: [
        {
          role: "system",
          content: "You are an expert actuary and benefits consultant. Write clear, professional analysis reports that explain complex insurance concepts in simple terms. Always write in plain English at an 8th grade reading level."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 600
    }, OPENAI_MODEL_CHAIN);

    return completion.choices[0].message.content || "Analysis pending - please check back shortly.";
  } catch (error) {
    console.error("Error generating AI analysis:", error);
    return "Our AI analysis system is currently processing your group. A detailed actuarial review will be available shortly.";
  }
}
