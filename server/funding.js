// Reads Employee Navigator's monthly funding workbook — September's billing,
// one line per participant per product — and files every invoice under the
// group it belongs to.
//
// The workbook names billing divisions ("Taz Bham LLC 101-0002", "116"), not
// companies, so the join to a group goes through the people: each line's
// participant is looked up among the group members the XML import produced,
// and an invoice goes to the group most of its participants belong to. That
// needs no other file and survives a division being renamed.
import * as XLSX from "xlsx";

const num = (v) => {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** "Last, First Middle" → "last, first" for matching; case, accents and suffixes dropped. */
export const nameKey = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "")
    .replace(/[^a-z, ]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/, ", ")
    .trim();

/** Same key from a member record's first and last names. */
export const memberKey = (m) => nameKey(`${m.last || ""}, ${m.first || ""}`);

/** The tier a funding "Rate Band" means, in the portal's census terms. */
export function bandTier(band) {
  const s = String(band || "").toLowerCase();
  if (!s) return null;
  if (/family/.test(s)) return "Employee + Family";
  if (/spouse|partner/.test(s)) return "Employee + Spouse";
  if (/child/.test(s)) return "Employee + Child(ren)";
  if (/employee|only|single/.test(s)) return "Employee";
  return null;
}

/**
 * Parse the workbook. Returns { month, lines, products } where `lines` is every
 * billing line across the AL and VT sheets, each flagged medical when its
 * product appears on the matching "(HEALTH)" sheet, and `month` is the billing
 * month read off the lines' start dates.
 */
export function parseFunding(buffer, filename = "") {
  let wb;
  try {
    wb = XLSX.read(buffer, { type: "buffer", cellDates: false, raw: false });
  } catch (e) {
    throw new Error("Could not open that file as a spreadsheet: " + e.message);
  }
  const sheet = (name) => {
    const ws = wb.Sheets[name];
    return ws ? XLSX.utils.sheet_to_json(ws, { raw: false, defval: null }) : null;
  };
  // Captive sheets: AL and VT carry every line; the (HEALTH) sheets the
  // medical subset. A workbook with different sheet names is not this report.
  const captives = ["AL", "VT"].filter((c) => wb.Sheets[c]);
  if (!captives.length) {
    throw new Error('This does not look like the funding workbook — no "AL" or "VT" sheet.');
  }
  const medicalKeys = new Set();
  for (const c of captives) {
    for (const r of sheet(`${c} (HEALTH)`) || []) {
      medicalKeys.add(`${r.Invoice}||${r["Family Id"]}||${r["Prod Id"]}`);
    }
  }
  const lines = [];
  const monthVotes = {};
  for (const c of captives) {
    for (const r of sheet(c) || []) {
      const invoice = String(r.Invoice || "").trim();
      const participant = String(r.Participant || "").trim();
      if (!invoice || !participant) continue;
      const product = String(r["Prod Id"] || "").trim();
      const start = String(r["Start Date"] || "").trim();
      const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(start);
      if (m) {
        const ym = `${m[3]}-${m[1].padStart(2, "0")}`;
        monthVotes[ym] = (monthVotes[ym] || 0) + 1;
      }
      lines.push({
        captive: c,
        invoice,
        org: String(r["Org Name"] || "").trim(),
        familyId: String(r["Family Id"] || "").trim(),
        participant,
        product,
        start,
        end: String(r["End Date"] || "").trim(),
        band: r["Rate Band"] == null ? null : String(r["Rate Band"]).trim(),
        volume: num(r.Volume),
        rate: num(r.Rate),
        // The (HEALTH) sheets carry EBPA's dental plans too; those are lines,
        // not medical, the same as the XML treats them.
        medical: medicalKeys.has(`${invoice}||${r["Family Id"]}||${product}`) && !/dental|vision/i.test(product),
      });
    }
  }
  if (!lines.length) throw new Error("No billing lines found in the workbook.");
  const month = Object.entries(monthVotes).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  // What each line is to the month: the month's own billing ("current"), a
  // prior month billed late ("retro"), or a reversal ("credit"). Enrollment
  // and rates come from current lines only; the rest are adjustments.
  for (const l of lines) {
    const m = /(\d{1,2})\/\d{1,2}\/(\d{4})/.exec(l.start);
    const ym = m ? `${m[2]}-${m[1].padStart(2, "0")}` : null;
    l.kind = l.rate < 0 ? "credit" : ym && month && ym !== month ? "retro" : "current";
  }
  const fm = /(\d{2})(\d{2})(\d{2})\d*/.exec(filename.replace(/^.*_(\d{6,})\D*$/, "$1"));
  return { month, lines, fileStamp: fm ? `20${fm[3]}-${fm[1]}-${fm[2]}` : null };
}

/**
 * File each invoice under a group by majority of its participants' names among
 * the groups' members. Returns { byInvoice, unassigned } where byInvoice maps
 * invoice → { group, votes, total, share }.
 */
export function assignInvoices(lines, groups) {
  const index = new Map();
  for (const g of groups) {
    for (const m of g.members || []) {
      const k = memberKey(m);
      if (!k || k === ",") continue;
      const arr = index.get(k) || [];
      if (!arr.includes(g.name)) arr.push(g.name);
      index.set(k, arr);
    }
  }
  const votes = new Map(); // invoice → { group → count }
  const totals = new Map();
  for (const l of lines) {
    if (!l.medical) continue; // medical lines are one per person and name the group best
    totals.set(l.invoice, (totals.get(l.invoice) || 0) + 1);
    const gs = index.get(nameKey(l.participant));
    if (!gs) continue;
    const v = votes.get(l.invoice) || {};
    for (const g of gs) v[g] = (v[g] || 0) + 1 / gs.length;
    votes.set(l.invoice, v);
  }
  // Invoices with no medical lines at all: vote with every line.
  for (const l of lines) {
    if (totals.has(l.invoice)) continue;
    totals.set(l.invoice, 0);
  }
  for (const l of lines) {
    if (l.medical || (votes.get(l.invoice) && Object.keys(votes.get(l.invoice)).length)) continue;
    totals.set(l.invoice, (totals.get(l.invoice) || 0) + 1);
    const gs = index.get(nameKey(l.participant));
    if (!gs) continue;
    const v = votes.get(l.invoice) || {};
    for (const g of gs) v[g] = (v[g] || 0) + 1 / gs.length;
    votes.set(l.invoice, v);
  }

  // A group's name, loosely: for invoices whose billing org is simply the
  // company name, when none of its people could be matched.
  const loose = (x) =>
    String(x || "")
      .toLowerCase()
      .replace(/\b(llc|inc|co|corp|corporation|company|holdings|the|of|and|ltd|lp|pc|pllc|dba)\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const byName = new Map(groups.map((g) => [loose(g.name), g.name]));
  // Billing orgs are truncated now and then ("Worth Industries, In"), so a
  // prefix of eight or more characters is accepted either way round.
  const nameFor = (org) => {
    const k = loose(org);
    if (!k) return null;
    if (byName.has(k)) return byName.get(k);
    if (k.length < 8) return null;
    const hits = [...byName.entries()].filter(([n]) => n.startsWith(k) || k.startsWith(n));
    return hits.length === 1 ? hits[0][1] : null;
  };

  const byInvoice = {};
  const unassigned = [];
  for (const invoice of new Set(lines.map((l) => l.invoice))) {
    const v = votes.get(invoice) || {};
    const ranked = Object.entries(v).sort((a, b) => b[1] - a[1]);
    const matched = ranked.reduce((a, x) => a + x[1], 0);
    const total = totals.get(invoice) || 0;
    const orgs = [...new Set(lines.filter((l) => l.invoice === invoice).map((l) => l.org))];
    const candidates = ranked.slice(0, 3).map(([g, n]) => ({ group: g, votes: Math.round(n * 100) / 100 }));
    // Majority of the people we could place, and at least one whole person.
    if (ranked.length && ranked[0][1] >= 1 && ranked[0][1] / matched >= 0.6) {
      byInvoice[invoice] = { group: ranked[0][0], votes: Math.round(ranked[0][1] * 100) / 100, matched: Math.round(matched * 100) / 100, total, orgs, by: "names", candidates };
      continue;
    }
    // No people placed: does a billing org simply carry the company's name?
    const named = orgs.map(nameFor).find(Boolean);
    if (named) {
      byInvoice[invoice] = { group: named, votes: 0, matched: 0, total, orgs, by: "org name", candidates };
      continue;
    }
    byInvoice[invoice] = { group: null, votes: ranked[0] ? Math.round(ranked[0][1] * 100) / 100 : 0, matched: Math.round(matched * 100) / 100, total, orgs, by: null, candidates };
    unassigned.push(invoice);
  }
  return { byInvoice, unassigned };
}

/**
 * Per-group summary of a month's billing: medical by plan and tier with the
 * billed rate, other products, and totals. No participant names here — this
 * is what the admin screens and the reconciliation use.
 */
export function summariseFunding(lines, byInvoice) {
  const groups = {};
  for (const l of lines) {
    const a = byInvoice[l.invoice];
    if (!a || !a.group) continue;
    const g = (groups[a.group] = groups[a.group] || {
      invoices: new Set(),
      orgs: new Set(),
      medical: { people: new Set(), lines: 0, monthly: 0, adjustments: 0, retro: 0, credits: 0, byPlan: {} },
      other: { lines: 0, monthly: 0, byProduct: {} },
    });
    g.invoices.add(l.invoice);
    g.orgs.add(l.org);
    if (l.medical) {
      const plan = l.product.replace(/\s+(19|20)\d{2}\s*$/, "").trim();
      const p = (g.medical.byPlan[plan] = g.medical.byPlan[plan] || { lines: 0, monthly: 0, adjustments: 0, byTier: {} });
      const tier = bandTier(l.band) || "(unknown)";
      const t = (p.byTier[tier] = p.byTier[tier] || { n: 0, monthly: 0, adjustments: 0, rates: {}, retro: 0, credits: 0 });
      if (l.kind === "current") {
        // One current line per participant per plan: the month's enrollment.
        g.medical.people.add(l.familyId || l.participant);
        g.medical.lines++;
        g.medical.monthly += l.rate;
        p.lines++;
        p.monthly += l.rate;
        t.n++;
        t.monthly += l.rate;
        const rk = l.rate.toFixed(2);
        t.rates[rk] = (t.rates[rk] || 0) + 1;
      } else {
        // Retro adds and credits change the invoice, not who is enrolled.
        g.medical.adjustments += l.rate;
        p.adjustments += l.rate;
        t.adjustments += l.rate;
        if (l.kind === "credit") {
          g.medical.credits++;
          t.credits++;
        } else {
          g.medical.retro++;
          t.retro++;
        }
      }
    } else {
      g.other.lines++;
      g.other.monthly += l.rate;
      const o = (g.other.byProduct[l.product] = g.other.byProduct[l.product] || { lines: 0, monthly: 0 });
      o.lines++;
      o.monthly += l.rate;
    }
  }
  const r2 = (n) => Math.round(n * 100) / 100;
  const out = {};
  for (const [name, g] of Object.entries(groups)) {
    const byPlan = {};
    for (const [plan, p] of Object.entries(g.medical.byPlan)) {
      const byTier = {};
      for (const [tier, t] of Object.entries(p.byTier)) {
        // The billed rate for the tier: the amount most current lines carry.
        // Anything else is a partial month and is reported as such.
        const ranked = Object.entries(t.rates).sort((a, b) => b[1] - a[1]);
        byTier[tier] = {
          n: t.n,
          monthly: r2(t.monthly),
          adjustments: r2(t.adjustments),
          rate: ranked[0] ? Number(ranked[0][0]) : null,
          rateLines: ranked[0] ? ranked[0][1] : 0,
          otherRates: ranked.slice(1).map(([r, n]) => ({ rate: Number(r), n })),
          retro: t.retro,
          credits: t.credits,
        };
      }
      byPlan[plan] = { lines: p.lines, monthly: r2(p.monthly), adjustments: r2(p.adjustments), byTier };
    }
    const medical = {
      participants: g.medical.people.size,
      lines: g.medical.lines,
      monthly: r2(g.medical.monthly),
      adjustments: r2(g.medical.adjustments),
      retro: g.medical.retro,
      credits: g.medical.credits,
      billed: r2(g.medical.monthly + g.medical.adjustments),
      byPlan,
    };
    out[name] = {
      invoices: [...g.invoices],
      orgs: [...g.orgs],
      medical,
      other: { lines: g.other.lines, monthly: r2(g.other.monthly), byProduct: Object.fromEntries(Object.entries(g.other.byProduct).map(([k, v]) => [k, { lines: v.lines, monthly: r2(v.monthly) }])) },
      totalMonthly: r2(g.medical.monthly + g.other.monthly),
      totalBilled: r2(g.medical.monthly + g.medical.adjustments + g.other.monthly),
    };
  }
  return out;
}
