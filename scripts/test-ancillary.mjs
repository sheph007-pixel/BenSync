// The ancillary rule, including a reading made before the question existed.
import assert from "node:assert/strict";

// Mirrors server/index.js isAncillaryRow and the client's isAncillary.
function isAncillaryRow(row) {
  const x = row.extracted || {};
  if (typeof x.quotes_medical === "boolean") return !x.quotes_medical;
  if (!row.extracted) return false;
  const text = `${row.filename || ""} ${row.summary || ""} ${x.proposal_type || ""}`;
  if (/\bancillar(y|ies)\b/i.test(text)) return true;
  const rated = (x.plans || []).some((pl) => Object.values(pl.rates || {}).some((v) => v != null));
  return !rated && /\b(dental|vision|life|ad&d|disability|std|ltd|accident|critical illness|hospital indemnity)\b/i.test(text);
}

const medical = { EE: 700, ES: 1400, EC: 1295, FAM: 1995 };

// Said outright, either way.
assert.equal(isAncillaryRow({ filename: "x.pdf", extracted: { quotes_medical: false } }), true);
assert.equal(isAncillaryRow({ filename: "ancillary.pdf", extracted: { quotes_medical: true } }), false, "what Claude says wins over the filename");

// Read before the question existed: the document is the evidence.
assert.equal(
  isAncillaryRow({
    filename: "Lioce Group - Default Ancillary Proposal.pdf",
    summary: "Basic Life/AD&D, dental and vision. No medical coverage is quoted here.",
    extracted: { plans: [] },
  }),
  true,
  "names itself ancillary",
);
assert.equal(
  isAncillaryRow({
    filename: "Group - Dental and Vision.pdf",
    summary: "Two passive PPO dental options and two vision options.",
    extracted: { plans: [{ name: "Dental PPO", rates: {} }] },
  }),
  true,
  "only ancillary products, no rated plan",
);
assert.equal(
  isAncillaryRow({
    filename: "The Lioce Group _Fully Insured EXB Med 3.pdf",
    summary: "Seven Insurance Choice+ plan options priced on 44 enrolled employees, plus dental riders.",
    extracted: { plans: [{ name: "Choice Plus 1000", rates: medical }] },
  }),
  false,
  "a medical quote that mentions dental is still medical",
);
assert.equal(
  isAncillaryRow({ filename: "quote.pdf", summary: "Rates unreadable.", extracted: { plans: [] } }),
  false,
  "an unreadable document is not called ancillary",
);
assert.equal(isAncillaryRow({ filename: "x.pdf", extracted: null }), false, "nothing read yet: no verdict");

console.log("ancillary: all assertions passed");
