/**
 * Claude AI Underwriter Review, ADVISORY ONLY.
 *
 * Runs after screenGroup() and writes the underwriter's file note for the
 * group: a single short plain-English paragraph, as if a senior medical
 * underwriter had just underwritten the group and summarized the result.
 * The screen's deterministic decision (Preferred/Standard → quote, High
 * Risk → decline) is already made before this runs; the note explains it.
 *
 * Hard rules (do not "enhance" these away):
 *  - The output NEVER changes kri / tier / decision / groups.riskTier or
 *    any gating, and the UI/PDF derive the approve/decline badge from the
 *    deterministic screen, never from this module's output.
 *  - Only AGGREGATE ScreenResult fields are sent to the API, counts,
 *    ages, percentages, driver text. Never census rows, names, DOBs,
 *    or per-member data (see CLAUDE.md sensitive-data rules).
 *  - Failure is non-fatal: missing key, API errors, or a refusal across the
 *    whole model chain all return null and the screen persists as before.
 *
 * Model selection: the ordered fallback chain lives in server/model-config.ts
 * (CLAUDE_MODEL_CHAIN). The review uses the best model that's actually
 * working, walking the chain on a refusal OR an availability/transient error
 * (model unavailable, no access, overloaded, rate-limited). To upgrade the
 * model, edit that file (or set the CLAUDE_MODEL_CHAIN env var).
 */
import {
  anthropicAvailable,
  callClaudeWithFallback,
} from "./anthropic-client";
import { loadScreenTables, type ScreenResult } from "./risk-screen";

// Local logger (not `log` from ./index): importing the server entry would
// boot the app when this module is loaded standalone (tests, scripts).
function log(message: string) {
  console.log(`[underwriter-review] ${message}`);
}

const REQUEST_TIMEOUT_MS = 60_000;

export interface UnderwriterReview {
  summary: string;   // the underwriter's note, one paragraph, 3-4 sentences
  model: string;     // which model actually served the review
  reviewed_at: string;
}

// Structured-outputs schema: guarantees the response parses into the shape
// above (structured outputs require additionalProperties: false).
const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description:
        "The underwriting file note: ONE paragraph, 3-4 sentences, 60-90 words, plain English.",
    },
  },
  required: ["summary"],
  additionalProperties: false,
} as const;

// Directionality is stated explicitly because an earlier LLM narrative
// (gpt-4o-mini score review, see server/ai-analysis.ts) produced
// direction-reversed text when the prompt left it implicit.
const SYSTEM_PROMPT = `You are a senior medical underwriter at BenSync. You have just finished underwriting a group using our AI risk screen, and you are writing the short file note that goes on the group's record. The screening decision is already made and is given to you - Preferred and Standard tiers are approved to quote, High Risk is declined. Your note explains the result; it never argues with it or second-guesses it.

Write EXACTLY this shape, so every group's note reads the same length:
- Sentence 1: the group, its size, the tier it underwrote to, and the result ("...underwrites to our Standard tier and is approved to quote." / "...underwrites as High Risk and is declined.").
- Sentences 2-3: WHY, in plain English a business owner could follow - the age and gender mix, the local health environment, and how expected claims compare to a typical group.
- Optional sentence 4: one thing worth keeping an eye on, only if genuinely worth saying.
One paragraph. 60-90 words. No bullets, no headings.

Voice and content rules:
- Plain professional English, like a self-funded underwriting note. Confident, not hedged.
- NEVER use system jargon: do not say "AI residual", "composite", "deterministic", "component", "normalized", "KRI", "threshold", "model", or "loss ratio". Translate the data into underwriting English (e.g. "claims for similar groups have run a bit above what the demographics alone suggest").
- At most one or two numbers in the whole note (e.g. average age, or expected cost vs. typical). The admin already sees every score on screen.
- Do not comment on census data quality or count reconciliation - the census is validated upstream. Judge the risk, not the data plumbing.
- Never invent member-level facts - you are given aggregates only.

How to read the data you are given (for your own reasoning, not to recite):
- Scores are calibrated so 1.00 = a typical group; HIGHER is WORSE (more expected cost), lower is better.
- Driver "impact" values: positive = increases risk, negative = decreases risk.
- predicted_pmpm above book_mean_pmpm = expected claims above a typical group.
- plan_projections loss_ratio above 1.00 = the plan would lose money on this group at current funding.`;

// Whitelist of aggregate fields sent to the API. Building the payload by
// explicit field selection (rather than passing the whole ScreenResult)
// keeps any future member-level additions to ScreenResult out of the
// request by default.
function buildReviewInput(s: ScreenResult) {
  const { weights } = loadScreenTables();
  return {
    kri: s.kri,
    tier: s.tier,
    decision: s.decision,
    thresholds: {
      preferred_below: weights.thresholds.preferred,
      high_risk_at_or_above: weights.thresholds.high_risk,
    },
    effective_date: s.effective_date,
    group_profile: {
      group_name: s.group,
      n_members: s.n_members,
      n_employees: s.n_employees,
      n_spouses: s.n_spouses,
      n_children: s.n_children,
      median_age: s.median_age,
      avg_age: s.avg_age,
      pct_female: s.pct_female,
      // family_tier_mix is intentionally excluded: it's derived from census
      // row-order household chaining and is unreliable when rows aren't
      // grouped by household, feeding it to the model produced false
      // "data integrity" flags.
      top_county: s.top_county,
      pct_top_county: s.pct_top_county,
      pct_medicare_cliff: s.pct_medicare_cliff,
    },
    components: {
      demographic: { normalized: s.demographic.normalized, drivers: s.demographic.drivers },
      geographic: { normalized: s.geographic.normalized, drivers: s.geographic.drivers },
      composition: { normalized: s.composition.normalized, drivers: s.composition.drivers },
      ai_residual: { clamped: s.ai_residual.clamped, drivers: s.ai_residual.drivers },
    },
    top_drivers: s.top_drivers,
    forecast: {
      predicted_pmpm: s.predicted_pmpm,
      predicted_pepm: s.predicted_pepm,
      predicted_annual_claims: s.predicted_annual_claims,
      book_mean_pmpm: s.book_mean_pmpm,
    },
    plan_projections: s.plan_projections,
  };
}

async function callModelWithFallback(screen: ScreenResult): Promise<UnderwriterReview> {
  // Walk CLAUDE_MODEL_CHAIN: the helper advances to the next model on a
  // refusal or an availability/transient error, so we always use the best
  // model that's actually working.
  const { response } = await callClaudeWithFallback(
    {
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      // No `thinking` param: Fable 5 has thinking always on and rejects
      // explicit config. No temperature/top_p: removed on this model family.
      output_config: {
        effort: "medium", // small structured-judgment task on a synchronous path
        format: { type: "json_schema", schema: REVIEW_SCHEMA as any },
      },
      messages: [
        {
          role: "user",
          content:
            "Write the underwriting file note for this screened group.\n\n" +
            JSON.stringify(buildReviewInput(screen)),
        },
      ],
    },
    { requestOptions: { timeout: REQUEST_TIMEOUT_MS } },
  );

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("no text content in model response");
  }
  const parsed = JSON.parse(textBlock.text);
  if (typeof parsed.summary !== "string" || parsed.summary.trim() === "") {
    throw new Error("model response failed shape validation");
  }
  return {
    summary: parsed.summary.trim(),
    model: response.model,
    reviewed_at: new Date().toISOString(),
  };
}

export async function generateUnderwriterReview(
  screen: ScreenResult,
): Promise<UnderwriterReview | null> {
  if (!anthropicAvailable()) return null;
  try {
    return await callModelWithFallback(screen);
  } catch (err: any) {
    // Non-fatal: no model in the chain produced a usable note. The screen
    // persists exactly as before, just without the advisory review.
    log(`underwriter review unavailable: ${err?.message || err}`);
    return null;
  }
}
