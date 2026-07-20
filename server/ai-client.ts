import OpenAI from "openai";

let _openai: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (_openai) return _openai;
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }
  _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

// HTTP statuses that mean "this request is wrong and will fail the same way on
// every model", switching models won't help. Everything else (404 model
// unavailable, 429 rate-limit, 5xx, connection errors) is worth retrying on
// the next model in the chain.
const NON_RECOVERABLE_STATUSES = new Set([400, 401, 413]);

function isRecoverableOpenAIError(err: unknown): boolean {
  if (err instanceof OpenAI.APIError && typeof err.status === "number") {
    return !NON_RECOVERABLE_STATUSES.has(err.status);
  }
  // Connection/timeout errors with no status, try the next model.
  return true;
}

/**
 * Call the Chat Completions API, walking `models` (best model first) and
 * falling back to the next model on an availability/transient error. Pass
 * everything except `model`; the chain supplies that.
 *
 * Throws if the whole chain is exhausted (or immediately on a non-recoverable
 * error) so the caller's own try/catch can run its deterministic fallback.
 */
export async function callOpenAIWithFallback(
  params: Omit<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, "model">,
  models: string[],
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const openai = getOpenAIClient();
  let lastError: unknown;

  for (const model of models) {
    try {
      return await openai.chat.completions.create({ ...params, model });
    } catch (err) {
      lastError = err;
      if (isRecoverableOpenAIError(err)) continue;
      throw err; // non-recoverable, same outcome on every model
    }
  }

  throw lastError ?? new Error("no OpenAI model configured in the chain");
}
