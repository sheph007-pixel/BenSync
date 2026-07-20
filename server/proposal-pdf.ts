/**
 * server/proposal-pdf.ts
 *
 * Lean, native PDF renderer for group proposals. Consumes the output
 * of `priceGroup()` (server/rate-engine.ts) plus the shared static
 * dental / vision / supplemental tables, and produces exactly three
 * sections:
 *
 *   Page 1  , Medical + Dental + Vision rates
 *   Page 2  , Supplemental benefits
 *   Page 3+ , Census roster in family order (employee, then the
 *              employee's spouse/children beneath them)
 *
 * Intentionally no executive-summary, methodology, or disclaimers
 * essays, the customer wants a clean rates sheet, not a whitepaper.
 * A short "illustrative, subject to underwriting" line lives in the
 * page footer.
 *
 * Zero runtime dependency on LibreOffice/Excel. Uses `pdfkit` only.
 */

import PDFDocument from "pdfkit";
import type { Group, CensusEntry } from "@shared/schema";
import type { PricingResult } from "./rate-engine";
import {
  DENTAL_PLANS,
  VISION_PLANS,
  SUPPLEMENTAL,
  type SimplePlan,
  type TieredRates,
  type SupplementalSection,
} from "@shared/benefits-rates";

// ── Kennion brand ─────────────────────────────────────────────────────────
const NAVY = "#0B2545";
const GOLD = "#C9A961";
const TEXT = "#1B1B1B";
const MUTED = "#6B7280";
const ROW_ALT = "#F4F6FA";

// ── Page geometry ─────────────────────────────────────────────────────────
const MARGIN_L = 48;
const MARGIN_R = 48;
const MARGIN_TOP = 48;
const MARGIN_BOTTOM = 56;
const HEADER_H = 52;
const FOOTER_BAND = 42;

// ── Customer-facing medical plan names ────────────────────────────────────
const PLAN_DISPLAY_MAP: Record<string, string> = {
  "Saver HSA": "Saver HSA (Health Savings Account)",
  "Elite Health Plan": "Elite Health",
  "Premier Health Plan": "Premier Health",
  "Select Health Plan": "Select Health",
  "Core Health Plan": "Core Health",
  "Value Essential MEC": "Value Essential (MEC)",
  "Freedom Platinum": "Freedom Platinum (Generic Rx)",
  "Freedom Gold": "Freedom Gold (Generic Rx)",
  "Freedom Silver": "Freedom Silver (Generic Rx)",
  "Freedom Bronze": "Freedom Bronze (Generic Rx)",
};

// Medical plans, page 1. Mirrors the client's MEDICAL_PLAN_ORDER in
// `use-proposal.ts` exactly so the PDF lists the same 15 plans the
// customer sees under the Medical tab, in the same order. Virtual /
// MEC / legacy plans are intentionally omitted from the proposal -
// they're admin-only in the engine and don't appear in the UI.
const MEDICAL_PLAN_ORDER = [
  "Deluxe Platinum",
  "Choice Gold",
  "Basic Gold",
  "Preferred Silver",
  "Enhanced Silver",
  "Classic Silver",
  "Saver HSA",
  "Elite Health Plan",
  "Premier Health Plan",
  "Select Health Plan",
  "Core Health Plan",
  "Freedom Platinum",
  "Freedom Gold",
  "Freedom Silver",
  "Freedom Bronze",
];

// ── Formatting helpers ────────────────────────────────────────────────────
function fmtUSD(n: number): string {
  if (!isFinite(n)) return "-";
  return "$" + n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDateLong(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

function fmtDateShort(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toLocaleDateString("en-US", {
    month: "2-digit", day: "2-digit", year: "numeric", timeZone: "UTC",
  });
}

function safeFileName(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, "_").replace(/_+/g, "_").slice(0, 80);
}

function relationshipLabel(rel: string): string {
  const r = (rel || "").trim().toUpperCase();
  if (r === "EE") return "Employee";
  if (r === "SP") return "Spouse";
  if (r === "CH") return "Child";
  return rel;
}

// ── Drawing helpers ───────────────────────────────────────────────────────
type Doc = InstanceType<typeof PDFDocument>;

function contentWidth(doc: Doc): number {
  return doc.page.width - MARGIN_L - MARGIN_R;
}

// Slim branded header strip: logo + tagline on the left, section title
// on the right. Same on every page so the document reads as one piece.
function header(doc: Doc, title: string) {
  const pw = doc.page.width;
  doc.save();
  doc.rect(0, 0, pw, HEADER_H).fill(NAVY);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(16)
    .text("BENSYNC", MARGIN_L, 18, { continued: true })
    .font("Helvetica").fontSize(10).fillColor(GOLD)
    .text("   Employee Benefits Program", { continued: false });
  doc.font("Helvetica").fontSize(10).fillColor("#E5E7EB")
    .text(title, pw - 280, 20, { width: 232, align: "right", lineBreak: false });
  doc.restore();
  doc.y = HEADER_H + 18;
  doc.fillColor(TEXT);
}

function renderFooterBand(doc: Doc, pageNum: number, totalPages: number) {
  const pw = doc.page.width;
  const ph = doc.page.height;
  const savedMarginBottom = doc.page.margins.bottom;
  // pdfkit auto-paginates if text is drawn below the bottom margin;
  // zero the margin while we stamp the footer so it stays on THIS page.
  doc.page.margins.bottom = 0;
  try {
    doc.save();
    doc.strokeColor(GOLD).lineWidth(0.8)
      .moveTo(MARGIN_L, ph - FOOTER_BAND + 4)
      .lineTo(pw - MARGIN_R, ph - FOOTER_BAND + 4)
      .stroke();
    doc.fillColor(MUTED).font("Helvetica").fontSize(8)
      .text(
        "Rates are illustrative and subject to final underwriting approval.",
        MARGIN_L, ph - 28,
        { width: pw - MARGIN_L - MARGIN_R, align: "left", lineBreak: false },
      );
    doc.fillColor(MUTED).font("Helvetica").fontSize(8)
      .text(`Page ${pageNum} of ${totalPages}`, pw - 140, ph - 28, {
        width: 100, align: "right", lineBreak: false,
      });
    doc.restore();
  } finally {
    doc.page.margins.bottom = savedMarginBottom;
  }
}

// Section header, small eyebrow title, no subtitle. Used inline on
// page 1 to separate Medical / Dental / Vision blocks.
function sectionHeader(doc: Doc, label: string) {
  const y = doc.y;
  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(11).text(
    label,
    MARGIN_L,
    y,
    { width: contentWidth(doc), lineBreak: false },
  );
  doc.y = y + 14;
}

// Shared tiered-rate table. `rows` is [displayName, note?, TieredRates].
// Compact row height keeps 18 medical + 7 dental + 4 vision tables all
// on one Letter page. Note column is optional and renders small-italic
// beneath the plan name when present.
type TableRow = {
  name: string;
  note?: string;
  rates: { EE: number; EC: number; ES: number; EF: number };
};

function renderTieredTable(doc: Doc, rows: TableRow[], opts?: { rowH?: number; contTitle?: string }) {
  const pw = doc.page.width;
  const leftX = MARGIN_L;
  const rightX = pw - MARGIN_R;
  const planColW = 220;
  const tierColW = (rightX - leftX - planColW) / 4;
  const rowH = opts?.rowH ?? 16;
  const headerH = 18;

  function drawHeaderBand() {
    const y0 = doc.y;
    doc.save();
    doc.rect(leftX, y0, rightX - leftX, headerH).fill(NAVY);
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(9);
    doc.text("Plan", leftX + 8, y0 + 5, { width: planColW - 8, lineBreak: false });
    const tiers: string[] = ["EE Only", "+ Children", "+ Spouse", "+ Family"];
    tiers.forEach((label, i) => {
      doc.text(label, leftX + planColW + i * tierColW, y0 + 5, {
        width: tierColW, align: "center", lineBreak: false,
      });
    });
    doc.restore();
    doc.y = y0 + headerH + 2;
  }

  drawHeaderBand();

  rows.forEach((r, idx) => {
    // Manual pagination, pdfkit's auto-paginator would slip rows onto
    // a new page without repeating the header band or respecting
    // surrounding layout, so we handle it explicitly.
    if (doc.y + rowH > doc.page.height - MARGIN_BOTTOM) {
      doc.addPage();
      if (opts?.contTitle) header(doc, opts.contTitle);
      drawHeaderBand();
    }
    const y = doc.y;
    if (idx % 2 === 0) {
      doc.save().rect(leftX, y - 1, rightX - leftX, rowH).fill(ROW_ALT).restore();
    }
    doc.fillColor(TEXT).font("Helvetica").fontSize(9.5);
    doc.text(r.name, leftX + 8, y + 2, {
      width: planColW - 8, lineBreak: false, ellipsis: true,
    });
    const values = [r.rates.EE, r.rates.EC, r.rates.ES, r.rates.EF];
    values.forEach((v, i) => {
      doc.text(fmtUSD(v), leftX + planColW + i * tierColW, y + 2, {
        width: tierColW - 6, align: "right", lineBreak: false,
      });
    });
    doc.y = y + rowH;
  });
}

// ── Page 1, Medical + Dental + Vision ───────────────────────────────────
function renderMedicalDentalVision(
  doc: Doc,
  group: Group,
  pricing: PricingResult,
) {
  // Top block: group name + effective/area meta
  {
    const y = doc.y;
    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(20).text(
      group.companyName || "-",
      MARGIN_L, y,
      { width: contentWidth(doc), lineBreak: false },
    );
    doc.y = y + 24;
  }
  doc.fillColor(MUTED).font("Helvetica").fontSize(10).text(
    `Effective ${fmtDateLong(pricing.effective_date)}  •  ${pricing.rating_area}  •  ${pricing.n_members} lives · ${pricing.n_employees} employees`,
    { lineBreak: false },
  );
  doc.moveDown(0.8);

  const available = Object.keys(pricing.plan_rates);
  const medicalRows: TableRow[] = MEDICAL_PLAN_ORDER.filter((p) =>
    available.includes(p),
  ).map((p) => ({
    name: PLAN_DISPLAY_MAP[p] || p,
    rates: pricing.plan_rates[p],
  }));

  sectionHeader(doc, "Medical");
  renderTieredTable(doc, medicalRows, { rowH: 15 });

  doc.moveDown(0.9);
  sectionHeader(doc, "Dental");
  renderTieredTable(doc, toSimpleRows(DENTAL_PLANS), { rowH: 15 });

  doc.moveDown(0.9);
  sectionHeader(doc, "Vision");
  renderTieredTable(doc, toSimpleRows(VISION_PLANS), { rowH: 15 });
}

function toSimpleRows(plans: SimplePlan[]): TableRow[] {
  return plans.map((p) => ({
    name: p.name,
    rates: tieredToFour(p.rates),
  }));
}

function tieredToFour(r: TieredRates): { EE: number; EC: number; ES: number; EF: number } {
  return { EE: r.EE, EC: r.EE_CH, ES: r.EE_SP, EF: r.EE_FAM };
}

// ── Page 2, Supplemental ────────────────────────────────────────────────
function renderSupplemental(
  doc: Doc,
  group: Group,
  pricing: PricingResult,
) {
  doc.addPage();
  header(doc, "Supplemental Benefits");

  {
    const y = doc.y;
    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(20).text(
      group.companyName || "-",
      MARGIN_L, y,
      { width: contentWidth(doc), lineBreak: false },
    );
    doc.y = y + 24;
  }
  doc.fillColor(MUTED).font("Helvetica").fontSize(10).text(
    `Effective ${fmtDateLong(pricing.effective_date)}  •  Voluntary / employee-paid`,
    { lineBreak: false },
  );
  doc.y += 6;

  // Voluntary benefits from the shared tables. Tight spacing so the
  // six sections fit on one page, a Kennion supplemental proposal is
  // expected to be exactly one page.
  const sections = Object.values(SUPPLEMENTAL);
  sections.forEach((section, idx) => {
    renderSupplementalSection(doc, section);
    if (idx < sections.length - 1) {
      doc.y += 4;
      // Safety paginate if content still overflows. Only happens if
      // the SUPPLEMENTAL table gains new sections without tightening.
      if (doc.y > doc.page.height - FOOTER_BAND - 60) {
        doc.addPage();
        header(doc, "Supplemental Benefits (cont.)");
      }
    }
  });
}

function renderSupplementalSection(doc: Doc, section: SupplementalSection) {
  sectionHeader(doc, section.label);
  if (section.note) {
    const y = doc.y;
    doc.fillColor(MUTED).font("Helvetica-Oblique").fontSize(9).text(
      section.note,
      MARGIN_L,
      y,
      { width: contentWidth(doc), lineBreak: false },
    );
    doc.y = y + 12;
  }

  if (section.kind === "flat") {
    renderTieredTable(
      doc,
      [{ name: section.label, rates: tieredToFour(section.rates) }],
      { rowH: 14 },
    );
    return;
  }

  if (section.kind === "plans") {
    renderTieredTable(
      doc,
      section.plans.map((p) => ({ name: p.label, rates: tieredToFour(p.rates) })),
      { rowH: 14 },
    );
    return;
  }

  // kind === "bands", render a narrow table using band labels in the
  // plan column. Some bands (e.g. STD) only fill EE; missing tiers show
  // as "-".
  const rows: TableRow[] = section.bands.map((b) => ({
    name: b.label,
    rates: {
      EE: b.rates.EE ?? NaN,
      EC: b.rates.EE_CH ?? NaN,
      ES: b.rates.EE_SP ?? NaN,
      EF: b.rates.EE_FAM ?? NaN,
    },
  }));
  renderTieredTable(doc, rows, { rowH: 12 });
}

// ── Page 3+, Census in family order ─────────────────────────────────────
function renderCensus(doc: Doc, group: Group, census: CensusEntry[]) {
  doc.addPage();
  header(doc, "Census Roster");

  {
    const y = doc.y;
    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(20).text(
      group.companyName || "-",
      MARGIN_L, y,
      { width: contentWidth(doc), lineBreak: false },
    );
    doc.y = y + 24;
  }
  doc.fillColor(MUTED).font("Helvetica").fontSize(10).text(
    `${census.length} enrolled ${census.length === 1 ? "member" : "members"}`,
    { lineBreak: false },
  );
  doc.moveDown(0.8);

  const ordered = orderByFamily(census);

  const pw = doc.page.width;
  const leftX = MARGIN_L;
  const rightX = pw - MARGIN_R;

  const colNumW = 26;
  const colRelW = 82;
  const colDobW = 82;
  const colGenderW = 56;
  const colZipW = 60;
  const colNameW = rightX - leftX - colNumW - colRelW - colDobW - colGenderW - colZipW;

  const cols = [
    { key: "#",     w: colNumW,    align: "right"  as const },
    { key: "Name",  w: colNameW,   align: "left"   as const },
    { key: "Role",  w: colRelW,    align: "left"   as const },
    { key: "DOB",   w: colDobW,    align: "left"   as const },
    { key: "Gender",w: colGenderW, align: "left"   as const },
    { key: "ZIP",   w: colZipW,    align: "left"   as const },
  ];
  const rowH = 16;

  function drawHeaderBand() {
    const y = doc.y;
    doc.save();
    doc.rect(leftX, y, rightX - leftX, rowH + 2).fill(NAVY);
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(9);
    let x = leftX + 8;
    cols.forEach((c) => {
      doc.text(c.key, x, y + 4, { width: c.w - 6, align: c.align, lineBreak: false });
      x += c.w;
    });
    doc.restore();
    doc.y = y + rowH + 4;
  }

  drawHeaderBand();
  ordered.forEach((entry, idx) => {
    if (doc.y > doc.page.height - FOOTER_BAND - 24) {
      doc.addPage();
      header(doc, "Census Roster (cont.)");
      drawHeaderBand();
    }
    const y = doc.y;
    // Shade employee rows more prominently so the start of each family
    // is visible; keep dependents on a plain background so the visual
    // grouping reads naturally.
    const isEE = (entry.relationship || "").toUpperCase() === "EE";
    if (isEE) {
      doc.save().rect(leftX, y - 1, rightX - leftX, rowH).fill(ROW_ALT).restore();
    }
    doc
      .fillColor(TEXT)
      .font(isEE ? "Helvetica-Bold" : "Helvetica")
      .fontSize(9);
    const values = [
      String(idx + 1),
      `${entry.firstName} ${entry.lastName}`.trim(),
      relationshipLabel(entry.relationship),
      fmtDateShort(entry.dateOfBirth),
      entry.gender || "-",
      entry.zipCode || "-",
    ];
    let x = leftX + 8;
    cols.forEach((c, i) => {
      doc.text(values[i], x, y + 3, {
        width: c.w - 6, align: c.align, lineBreak: false, ellipsis: true,
      });
      x += c.w;
    });
    doc.y = y + rowH;
  });
}

// Walk the roster in insertion order, grouping each Employee with the
// Spouse/Child rows that appear beneath them in the source, matches
// the census-modal's "Spouse/Child rows attach to the most recent
// Employee above" convention. Orphaned dependents (no preceding EE)
// fall to the end so nothing disappears from the roster.
function orderByFamily(census: CensusEntry[]): CensusEntry[] {
  const families: CensusEntry[][] = [];
  const orphans: CensusEntry[] = [];
  let current: CensusEntry[] | null = null;

  for (const row of census) {
    const rel = (row.relationship || "").toUpperCase();
    if (rel === "EE") {
      current = [row];
      families.push(current);
    } else if (current) {
      current.push(row);
    } else {
      orphans.push(row);
    }
  }

  const out: CensusEntry[] = [];
  for (const fam of families) {
    // Within a family: EE first (already), then Spouse, then Children.
    const ee = fam[0];
    const deps = fam.slice(1).sort((a, b) => {
      const rank = (r: string) => ((r || "").toUpperCase() === "SP" ? 0 : 1);
      return rank(a.relationship) - rank(b.relationship);
    });
    out.push(ee, ...deps);
  }
  return [...out, ...orphans];
}

// ── Public entry point ────────────────────────────────────────────────────
export interface RenderProposalOutput {
  pdfBuffer: Buffer;
  fileName: string;
}

export async function renderProposalPdf(
  group: Group,
  pricing: PricingResult,
  census: CensusEntry[],
): Promise<RenderProposalOutput> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "LETTER",
        margins: {
          top: MARGIN_TOP,
          bottom: MARGIN_BOTTOM,
          left: MARGIN_L,
          right: MARGIN_R,
        },
        bufferPages: true,
        info: {
          Title: `${group.companyName}, Group Benefits Proposal`,
          Author: "BenSync",
          Subject: "Group Benefits Proposal",
          Creator: "BenSync Rate Engine",
          Producer: `BenSync Rate Engine v${pricing.engine_version}`,
        },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c as Buffer));
      doc.on("end", () => {
        const pdfBuffer = Buffer.concat(chunks);
        const ts = new Date().toISOString().slice(0, 10);
        const fileName =
          `Proposal_${safeFileName(group.companyName || "group")}_${ts}.pdf`;
        resolve({ pdfBuffer, fileName });
      });
      doc.on("error", reject);

      // Page 1
      header(doc, "Group Benefits Proposal");
      renderMedicalDentalVision(doc, group, pricing);

      // Page 2
      renderSupplemental(doc, group, pricing);

      // Page 3+
      if (census.length > 0) renderCensus(doc, group, census);

      // Stamp footers on every page now that layout is complete.
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        renderFooterBand(doc, i + 1, range.count);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

