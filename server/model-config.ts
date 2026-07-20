/**
 * Central AI model registry.
 *
 * This is the ONE place that names the model each provider should use and the
 * ordered fallback chain to walk when the preferred model isn't working. The
 * first entry in each chain is the best/newest model; later entries are
 * fallbacks tried (in order) when an earlier one is unavailable, overloaded,
 * rate-limited, or (for Claude) refuses.
 *
 * To bump to a newer model: edit the default array below, or set the matching
 * env var on Railway (comma-separated) to override without a code change.
 *
 *   CLAUDE_MODEL_CHAIN       e.g. "claude-fable-5,claude-opus-4-8,claude-sonnet-4-6"
 *   OPENAI_MODEL_CHAIN       e.g. "gpt-4o"            (long-form prose)
 *   OPENAI_MODEL_CHAIN_FAST  e.g. "gpt-4o-mini,gpt-4o" (cheap structured tasks)
 */

function chainFromEnv(envValue: string | undefined, fallback: string[]): string[] {
  if (!envValue) return fallback;
  const parsed = envValue
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parsed.length > 0 ? parsed : fallback;
}

// Claude (Anthropic). Fable 5 is the most capable; Opus 4.8 is the
// Anthropic-recommended fallback; Sonnet 4.6 is a cheaper last resort. All
// three share the request surface this app uses (structured outputs via
// output_config.format; no thinking/temperature params).
export const CLAUDE_MODEL_CHAIN: string[] = chainFromEnv(
  process.env.CLAUDE_MODEL_CHAIN,
  ["claude-fable-5", "claude-opus-4-8", "claude-sonnet-4-6"],
);

// OpenAI, long-form prose (actuarial analysis, validation guidance).
export const OPENAI_MODEL_CHAIN: string[] = chainFromEnv(
  process.env.OPENAI_MODEL_CHAIN,
  ["gpt-4o"],
);

// OpenAI, cheap structured tasks (CSV column mapping). Falls back to the
// full model if the mini tier is unavailable.
export const OPENAI_MODEL_CHAIN_FAST: string[] = chainFromEnv(
  process.env.OPENAI_MODEL_CHAIN_FAST,
  ["gpt-4o-mini", "gpt-4o"],
);
