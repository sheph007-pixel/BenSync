import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL_CHAIN } from "./model-config";

let _anthropic: Anthropic | null = null;

// The Railway service stores the Anthropic key under the legacy variable
// name CLAUDE; ANTHROPIC_API_KEY takes precedence when both are set. The
// SDK only auto-reads ANTHROPIC_API_KEY, so the key is passed explicitly.
function resolveApiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY || process.env.CLAUDE;
}

export function anthropicAvailable(): boolean {
  return !!resolveApiKey();
}

export function getAnthropicClient(): Anthropic {
  if (_anthropic) return _anthropic;
  const apiKey = resolveApiKey();
  if (!apiKey) {
    throw new Error("Neither ANTHROPIC_API_KEY nor CLAUDE environment variable is set");
  }
  _anthropic = new Anthropic({ apiKey });
  return _anthropic;
}

export interface ClaudeFallbackResult {
  response: Anthropic.Message;
  model: string; // the model that actually served the response
}

// Thrown when every model in the chain failed or refused. Callers that treat
// AI output as advisory should catch this and degrade gracefully.
export class AllModelsExhaustedError extends Error {
  constructor(public readonly lastError?: unknown) {
    super("all Claude models in the chain failed or refused");
    this.name = "AllModelsExhaustedError";
  }
}

// HTTP statuses that mean "this request is wrong and will fail the same way on
// every model", switching models won't help, so stop the walk immediately.
// Everything else (404 unavailable, 403 no-access, 429 rate-limit, 5xx,
// 529 overloaded, connection errors) is worth retrying on the next model.
const NON_RECOVERABLE_STATUSES = new Set([400, 401, 413]);

function isRecoverableClaudeError(err: unknown): boolean {
  if (err instanceof Anthropic.APIError && typeof err.status === "number") {
    return !NON_RECOVERABLE_STATUSES.has(err.status);
  }
  // Connection/timeout errors with no status, try the next model.
  return true;
}

/**
 * Call the Messages API, walking CLAUDE_MODEL_CHAIN (best model first) and
 * falling back to the next model on a refusal or an availability/transient
 * error. Pass everything except `model`; the chain supplies that.
 *
 * Returns the first successful (non-refusal) response and the model that
 * served it. Throws AllModelsExhaustedError if the whole chain is exhausted,
 * or rethrows immediately on a non-recoverable error (e.g. a 400, our bug).
 */
export async function callClaudeWithFallback(
  params: Omit<Anthropic.MessageCreateParamsNonStreaming, "model">,
  options?: { models?: string[]; requestOptions?: Anthropic.RequestOptions },
): Promise<ClaudeFallbackResult> {
  const client = getAnthropicClient();
  const models = options?.models ?? CLAUDE_MODEL_CHAIN;
  let lastError: unknown;

  for (const model of models) {
    try {
      const response = await client.messages.create(
        { ...params, model },
        options?.requestOptions,
      );
      if (response.stop_reason === "refusal") {
        // Safety classifier declined, a different model may accept it.
        lastError = new Error(`model ${model} refused the request`);
        continue;
      }
      return { response, model };
    } catch (err) {
      lastError = err;
      if (isRecoverableClaudeError(err)) continue;
      throw err; // non-recoverable, same outcome on every model
    }
  }

  throw new AllModelsExhaustedError(lastError);
}
