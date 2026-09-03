// Reads a carrier proposal and says which group it belongs to.
//
// A proposal from UnitedHealthcare, Gravie, Nationwide or anyone else arrives
// as a PDF. Claude reads the document itself — no text extraction step to lose
// a scanned page — and returns the carrier, the company named on the paper,
// the plans and tier rates, and the roster group it matches with a confidence.
// Nothing here is authoritative: the staff can reassign any proposal, and the
// extracted figures are stored for review, not pushed into the rate tables.
import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";

/**
 * The API key. The SDK reads ANTHROPIC_API_KEY on its own; CLAUDE and
 * CLAUDE_API_KEY are accepted too, since that is how the key was first added
 * to Railway and renaming a secret is a chore nobody should have to do.
 */
const apiKey = () =>
  process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || process.env.CLAUDE || "";

/** Set when the deployment has an Anthropic credential to call with. */
export const aiEnabled = () => !!(apiKey() || process.env.ANTHROPIC_AUTH_TOKEN || fakeAi());

/**
 * Local end-to-end runs only (KENNION_FAKE_AI=1): no key, no network. A text
 * upload whose body is a JSON extraction is returned as the reading, so the
 * whole path after the model — filing, slots, the group's Options page — can
 * be exercised. Never set in a deployment.
 */
const fakeAi = () => process.env.KENNION_FAKE_AI === "1";
function fakeReading(file) {
  const p = file.prepared || {};
  const text = p.text || (p.buffer ? p.buffer.toString("utf8") : "");
  try {
    const j = JSON.parse(text);
    return {
      carrier: "Unknown",
      funding: "unknown",
      group_name_on_document: null,
      matched_group: null,
      confidence: 0,
      effective_date: null,
      proposal_type: "unknown",
      enrolled_on_document: null,
      plans: [],
      total_monthly: null,
      summary: "Canned reading (KENNION_FAKE_AI).",
      audit_flags: [],
      ...j,
    };
  } catch {
    return { carrier: "Unknown", funding: "unknown", group_name_on_document: null, matched_group: null, confidence: 0, effective_date: null, proposal_type: "unknown", enrolled_on_document: null, plans: [], total_monthly: null, summary: "Canned reading: not JSON.", audit_flags: ["unreadable"] };
  }
}

const MODEL = "claude-opus-5";

const nullable = (t) => ({ anyOf: [{ type: t }, { type: "null" }] });

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "carrier",
    "funding",
    "group_name_on_document",
    "matched_group",
    "confidence",
    "effective_date",
    "proposal_type",
    "enrolled_on_document",
    "plans",
    "total_monthly",
    "summary",
    "audit_flags",
  ],
  properties: {
    carrier: {
      type: "string",
      description:
        "The carrier or vendor issuing the proposal, e.g. UnitedHealthcare, Surest, Gravie, Nationwide, EBPA, HealthEZ, BCBS of Alabama. 'Unknown' if it cannot be told.",
    },
    funding: {
      type: "string",
      description:
        "How the quoted plan is funded: 'fully insured', 'level funded', 'self funded', or 'unknown'. UnitedHealthcare quotes are usually one of the first two — say which.",
    },
    group_name_on_document: {
      ...nullable("string"),
      description: "The employer / group name exactly as printed on the proposal, or null.",
    },
    matched_group: {
      ...nullable("string"),
      description:
        "The roster group this proposal is for — copied EXACTLY from the roster list — or null if no roster group clearly matches.",
    },
    confidence: {
      type: "number",
      description:
        "0 to 1. How sure the match is. 0.9+ only when the name on the document is unmistakably the roster group.",
    },
    effective_date: {
      ...nullable("string"),
      description: "Proposed effective date as printed (ISO yyyy-mm-dd if possible), or null.",
    },
    proposal_type: {
      type: "string",
      description: "renewal, new business, alternative quote, or unknown.",
    },
    enrolled_on_document: {
      ...nullable("integer"),
      description: "Number of enrolled employees the proposal is priced on, if stated.",
    },
    plans: {
      type: "array",
      description: "Each plan option quoted, with monthly composite rates by tier where given.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "plan_type", "deductible", "oop_max", "rates", "monthly_total"],
        properties: {
          name: { type: "string" },
          plan_type: nullable("string"),
          deductible: nullable("string"),
          oop_max: nullable("string"),
          rates: {
            type: "object",
            additionalProperties: false,
            required: ["EE", "ES", "EC", "FAM"],
            properties: {
              EE: nullable("number"),
              ES: nullable("number"),
              EC: nullable("number"),
              FAM: nullable("number"),
            },
          },
          monthly_total: nullable("number"),
        },
      },
    },
    total_monthly: {
      ...nullable("number"),
      description: "Total monthly premium for the proposal at the quoted enrollment, if stated.",
    },
    summary: {
      type: "string",
      description: "One or two sentences a benefits advisor would want: what was quoted and anything unusual.",
    },
    audit_flags: {
      type: "array",
      items: { type: "string" },
      description:
        "Short notes on anything that needs a human look: name does not match cleanly, enrollment differs from the roster, rates missing, dates odd, pages unreadable.",
    },
  },
};

const SYSTEM = `You read insurance carrier proposals for Kennion Benefit Advisors, a benefits brokerage in Alabama. Each proposal is a quote for one employer group's medical plan, sent by a carrier such as UnitedHealthcare (including Surest), Gravie, Nationwide, EBPA, HealthEZ or BCBS of Alabama.

Your job: identify the carrier, read off the plans and tier rates, and decide which group on Kennion's roster the proposal is for. Match by the employer name on the document against the roster names. Treat legal-form words (LLC, Inc., Co., Corporation, Holdings) and punctuation loosely, but do not match on a shared common word alone — "Birmingham Steel" is not "Birmingham-Toledo". When two roster groups could both fit, pick neither and say so in the flags. Copy the matched roster name exactly as listed. Say whether the quote is fully insured or level funded — UnitedHealthcare sends both kinds and Kennion tracks them as separate proposals. Rates are monthly composite amounts per tier: EE (employee only), ES (employee + spouse), EC (employee + children), FAM (family). Leave a value null rather than guessing.`;

/**
 * Read one proposal. `file` is { filename, prepared, context } where `prepared`
 * came from intake.prepareForModel and `context` is the email it arrived in,
 * if any. `roster` is [{ name, enrolled, tpa }] for every live group. Returns
 * the extraction, or throws with a message the admin screen can show.
 */
export async function analyzeProposal(file, roster) {
  if (fakeAi()) return fakeReading(file);
  if (!aiEnabled()) throw new Error("AI matching is off: no ANTHROPIC_API_KEY is set.");
  const client = apiKey() ? new Anthropic({ apiKey: apiKey() }) : new Anthropic();

  const rosterText = roster
    .map((g) => `- ${g.name} (${g.enrolled} enrolled, ${g.tpa || "TPA unknown"})`)
    .join("\n");

  const content = [];
  const p = file.prepared;
  if (p.kind === "pdf") {
    content.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: p.buffer.toString("base64") },
      title: file.filename,
    });
  } else if (p.kind === "image") {
    content.push({
      type: "image",
      source: { type: "base64", media_type: p.mime, data: p.buffer.toString("base64") },
    });
  } else {
    // Text: a CSV, a spreadsheet or Word file already flattened, or an email body.
    content.push({
      type: "document",
      source: { type: "text", media_type: "text/plain", data: p.text || "(empty)" },
      title: file.filename,
    });
  }

  const ctx = file.context;
  const emailNote = ctx
    ? `\n\nThis file arrived as an attachment to an email, which is useful context for the match (the subject or body often names the group):\nFrom: ${ctx.from || "?"}\nSubject: ${ctx.subject || "?"}\nDate: ${ctx.date || "?"}\nBody:\n${ctx.body || "(empty)"}`
    : "";
  content.push({
    type: "text",
    text: `The file is named "${file.filename}".${emailNote}\n\nKennion's roster — the only groups a proposal can be matched to:\n${rosterText}\n\nRead the proposal and fill in the structured result.`,
  });

  const params = {
    model: MODEL,
    max_tokens: 16000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "medium", format: jsonSchemaOutputFormat(SCHEMA) },
    messages: [{ role: "user", content }],
  };

  // Server-side refusal fallback on the beta endpoint; if that request is
  // refused as malformed (an org without the beta, say), the same call on the
  // stable endpoint is identical minus the fallback.
  let response;
  const beta = client.beta && client.beta.messages && typeof client.beta.messages.parse === "function";
  if (beta) {
    try {
      response = await client.beta.messages.parse({
        ...params,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
    } catch (e) {
      if (!(e instanceof Anthropic.BadRequestError)) throw e;
      console.warn("beta fallback request rejected, retrying without it:", e.message);
    }
  }
  if (!response) response = await client.messages.parse(params);

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to read this document.");
  }
  if (!response.parsed_output) {
    throw new Error("Could not read a structured result from the document.");
  }
  return response.parsed_output;
}


/**
 * Explain a reconciliation: Employee Navigator's carrier stats report against
 * what the import produced, with what the import left out and why. Aggregates
 * only — no member data leaves the server. Returns plain text for the screen.
 */
export async function explainReconciliation(payload) {
  if (fakeAi()) return "Canned explanation (KENNION_FAKE_AI).";
  if (!aiEnabled()) throw new Error("AI is off: no ANTHROPIC_API_KEY is set.");
  const client = apiKey() ? new Anthropic({ apiKey: apiKey() }) : new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "medium" },
    system:
      "You are a benefits data analyst helping a brokerage reconcile its own import of an Employee Navigator XML export against Employee Navigator's Carrier Stats report. The report's 'Enrolled Employees' and 'Plan Costs' per carrier are the reference. The import's rules: an employee is skipped when their employment status says terminated/inactive/deceased; a medical enrollment counts when its EndDate is nil, absent or in the future; waived elections are skipped; an enrollment with no PlanCost adds nothing to premium. The diagnostics say how many enrollments each rule left out, by carrier program, with the premium they carried. Write for a benefits advisor: plain language, no code. For each carrier that differs by more than about 1%, say what most likely explains the difference, citing the specific exclusion bucket and numbers, and whether a rule should change to match Employee Navigator's counting — be concrete about which rule. If the gap cannot be explained by the buckets, say what to look at next. Keep it under 300 words.",
    messages: [{ role: "user", content: JSON.stringify(payload) }],
  });
  if (response.stop_reason === "refusal") throw new Error("The model declined this request.");
  return response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
