/**
 * PDF Proposal Generator, creates professional proposal PDFs using PDFKit.
 */
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import type { ProposalData, MemberRate } from "./proposal-engine-calc";

const PROPOSALS_DIR = path.join(process.cwd(), "uploads", "proposals");

// Ensure directory exists
fs.mkdirSync(PROPOSALS_DIR, { recursive: true });

// ─── Colors ───────────────────────────────────────────────────────────────
const COLORS = {
  primary: "#1a365d",      // Dark blue
  secondary: "#2b6cb0",    // Medium blue
  accent: "#3182ce",       // Light blue
  success: "#276749",      // Green
  warning: "#975a16",      // Amber
  danger: "#9b2c2c",       // Red
  text: "#1a202c",         // Near black
  muted: "#718096",        // Gray
  light: "#e2e8f0",        // Light gray
  white: "#ffffff",
  bgLight: "#f7fafc",      // Very light gray
  headerBg: "#1a365d",     // Dark blue header
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function formatRelationship(rel: string): string {
  const upper = rel.toUpperCase();
  if (upper === "EE" || upper === "EMPLOYEE") return "Employee";
  if (upper === "SP" || upper === "SPOUSE") return "Spouse";
  if (upper === "CH" || upper === "CHILD") return "Child";
  return rel;
}

function getTierLabel(tier: string): string {
  if (tier === "preferred") return "Preferred Risk";
  if (tier === "standard") return "Standard Risk";
  if (tier === "high") return "High Risk";
  return tier;
}

function getTierColor(tier: string): string {
  if (tier === "preferred") return COLORS.success;
  if (tier === "standard") return COLORS.warning;
  return COLORS.danger;
}

// ─── PDF Table Drawing ────────────────────────────────────────────────────

interface TableColumn {
  header: string;
  width: number;
  align?: "left" | "center" | "right";
  getValue: (row: any) => string;
}

function drawTable(
  doc: PDFKit.PDFDocument,
  y: number,
  columns: TableColumn[],
  rows: any[],
  options?: { fontSize?: number; rowHeight?: number; maxRows?: number; zebra?: boolean }
) {
  const fontSize = options?.fontSize || 8;
  const rowHeight = options?.rowHeight || 16;
  const zebra = options?.zebra !== false;
  const maxRows = options?.maxRows;
  const startX = 50;

  // Header row
  doc.save();
  doc.rect(startX, y, columns.reduce((s, c) => s + c.width, 0), rowHeight + 2).fill(COLORS.headerBg);

  let x = startX;
  doc.font("Helvetica-Bold").fontSize(fontSize).fillColor(COLORS.white);
  for (const col of columns) {
    const textX = col.align === "right" ? x + col.width - 4 : col.align === "center" ? x + col.width / 2 : x + 4;
    const textOpts: any = { width: col.width - 8 };
    if (col.align === "right") textOpts.align = "right";
    else if (col.align === "center") textOpts.align = "center";
    doc.text(col.header, col.align === "right" ? x : col.align === "center" ? x : x + 4, y + 4, textOpts);
    x += col.width;
  }
  doc.restore();

  y += rowHeight + 2;

  // Data rows
  const displayRows = maxRows ? rows.slice(0, maxRows) : rows;
  for (let i = 0; i < displayRows.length; i++) {
    // Check for page overflow
    if (y + rowHeight > doc.page.height - 60) {
      doc.addPage();
      y = 50;
      // Re-draw header on new page
      doc.save();
      doc.rect(startX, y, columns.reduce((s, c) => s + c.width, 0), rowHeight + 2).fill(COLORS.headerBg);
      let hx = startX;
      doc.font("Helvetica-Bold").fontSize(fontSize).fillColor(COLORS.white);
      for (const col of columns) {
        doc.text(col.header, col.align === "right" ? hx : col.align === "center" ? hx : hx + 4, y + 4, {
          width: col.width - 8,
          align: col.align || "left",
        });
        hx += col.width;
      }
      doc.restore();
      y += rowHeight + 2;
    }

    const row = displayRows[i];

    // Zebra stripe
    if (zebra && i % 2 === 1) {
      doc.save();
      doc.rect(startX, y, columns.reduce((s, c) => s + c.width, 0), rowHeight).fill(COLORS.bgLight);
      doc.restore();
    }

    x = startX;
    doc.font("Helvetica").fontSize(fontSize).fillColor(COLORS.text);
    for (const col of columns) {
      const val = col.getValue(row);
      doc.text(val, col.align === "right" ? x : col.align === "center" ? x : x + 4, y + 4, {
        width: col.width - 8,
        align: col.align || "left",
      });
      x += col.width;
    }

    // Bottom border
    doc.save();
    doc.moveTo(startX, y + rowHeight).lineTo(startX + columns.reduce((s, c) => s + c.width, 0), y + rowHeight)
      .lineWidth(0.3).strokeColor(COLORS.light).stroke();
    doc.restore();

    y += rowHeight;
  }

  return y;
}

// ─── PDF Generation ───────────────────────────────────────────────────────

export async function generateProposalPDF(data: ProposalData): Promise<{ filePath: string; fileName: string }> {
  const companySlug = data.group.companyName.replace(/[^a-zA-Z0-9]/g, "_");
  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = `Proposal_${companySlug}_${dateStr}.pdf`;
  const filePath = path.join(PROPOSALS_DIR, `${data.group.id}_${Date.now()}.pdf`);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "letter",
      margins: { top: 40, bottom: 40, left: 50, right: 50 },
      info: {
        Title: `Health Benefits Proposal, ${data.group.companyName}`,
        Author: "BenSync",
        Subject: "Group Health Insurance Proposal",
      },
    });

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const pageW = doc.page.width - 100; // usable width

    // ═══════════════════════════════════════════════════════════
    // PAGE 1, Cover / Summary
    // ═══════════════════════════════════════════════════════════

    let y = 40;

    // Header bar
    doc.rect(0, 0, doc.page.width, 80).fill(COLORS.headerBg);
    doc.font("Helvetica-Bold").fontSize(22).fillColor(COLORS.white);
    doc.text("BENSYNC", 50, 25);
    doc.font("Helvetica").fontSize(10).fillColor("#a0c4e8");
    doc.text("Group Health Benefits Proposal", 50, 52);

    y = 100;

    // Company info block
    doc.rect(50, y, pageW, 70).lineWidth(1).strokeColor(COLORS.accent).stroke();
    doc.font("Helvetica-Bold").fontSize(16).fillColor(COLORS.primary);
    doc.text(data.group.companyName, 65, y + 12);
    doc.font("Helvetica").fontSize(10).fillColor(COLORS.muted);
    doc.text(`Prepared: ${formatDate(new Date())}`, 65, y + 34);
    doc.text(`Contact: ${data.group.contactName}  |  ${data.group.contactEmail}`, 65, y + 48);

    y += 90;

    // Risk Classification Box
    const tierColor = getTierColor(data.summary.riskTier);
    const tierLabel = getTierLabel(data.summary.riskTier);
    doc.rect(50, y, pageW, 55).lineWidth(2).strokeColor(tierColor).stroke();
    doc.rect(50, y, 8, 55).fill(tierColor);
    doc.font("Helvetica-Bold").fontSize(13).fillColor(tierColor);
    doc.text("Risk Classification", 70, y + 8);
    doc.font("Helvetica-Bold").fontSize(20).fillColor(tierColor);
    doc.text(`${tierLabel}  ·  ${data.summary.compositeRiskFactor.toFixed(3)}`, 70, y + 26);

    y += 75;

    // Group Summary Cards (2x2 layout)
    const cardW = (pageW - 15) / 2;
    const cardH = 65;

    // Card: Total Lives
    drawSummaryCard(doc, 50, y, cardW, cardH, "Total Lives", String(data.summary.totalLives), COLORS.secondary);
    // Card: Average Age
    drawSummaryCard(doc, 50 + cardW + 15, y, cardW, cardH, "Average Age", `${data.summary.averageAge.toFixed(1)} years`, COLORS.secondary);
    y += cardH + 10;
    // Card: Employee Breakdown
    drawSummaryCard(doc, 50, y, cardW, cardH, "Enrollment",
      `${data.summary.employees} EE  /  ${data.summary.spouses} SP  /  ${data.summary.children} CH`, COLORS.secondary);
    // Card: Gender Mix
    drawSummaryCard(doc, 50 + cardW + 15, y, cardW, cardH, "Gender Mix",
      `${data.summary.maleCount} Male  /  ${data.summary.femaleCount} Female`, COLORS.secondary);

    y += cardH + 25;

    // Risk tier explanation
    doc.font("Helvetica").fontSize(9).fillColor(COLORS.muted);
    if (data.summary.riskTier === "preferred") {
      doc.text("Your group's demographics indicate lower-than-average expected medical costs. This qualifies your group for preferred pricing tiers with potential savings of 15-25% compared to standard market rates.", 50, y, { width: pageW });
    } else if (data.summary.riskTier === "standard") {
      doc.text("Your group's demographics fall within the average range for expected medical costs. Multiple competitive plan options are available for groups in this tier.", 50, y, { width: pageW });
    } else {
      doc.text("Your group has above-average expected medical costs based on demographic factors. We recommend reviewing fully-insured plan options that provide appropriate coverage and cost protection.", 50, y, { width: pageW });
    }

    y += 40;

    // Advisor info
    doc.rect(50, y, pageW, 40).fill(COLORS.bgLight);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.primary);
    doc.text("Your Advisor", 65, y + 8);
    doc.font("Helvetica").fontSize(9).fillColor(COLORS.text);
    doc.text("Hunter Shepherd  |  hunter@kennion.com", 65, y + 22);

    // ═══════════════════════════════════════════════════════════
    // PAGE 2, Age Band Risk Analysis
    // ═══════════════════════════════════════════════════════════
    doc.addPage();
    y = 40;

    // Header
    doc.rect(0, 0, doc.page.width, 50).fill(COLORS.headerBg);
    doc.font("Helvetica-Bold").fontSize(14).fillColor(COLORS.white);
    doc.text("Age Band Risk Analysis", 50, 16);
    doc.font("Helvetica").fontSize(9).fillColor("#a0c4e8");
    doc.text(data.group.companyName, 50, 34);

    y = 65;

    // Age band summary table
    const ageBands = ["0-4", "5-9", "10-14", "15-19", "20-24", "25-29", "30-34", "35-39",
      "40-44", "45-49", "50-54", "55-59", "60-64", "65-69", "70+"];

    const bandRows: any[] = [];
    let totalF = 0, totalM = 0, totalRisk = 0, totalCount = 0;

    for (const band of ageBands) {
      const breakdown = data.summary.ageBandBreakdown[band];
      if (!breakdown || breakdown.count === 0) continue;
      const females = breakdown.members.filter(m => m.gender.toLowerCase() === "female").length;
      const males = breakdown.members.filter(m => m.gender.toLowerCase() === "male").length;
      totalF += females;
      totalM += males;
      totalRisk += breakdown.avgRisk * breakdown.count;
      totalCount += breakdown.count;

      bandRows.push({ band, females, males, total: breakdown.count, avgRisk: breakdown.avgRisk });
    }

    const bandColumns: TableColumn[] = [
      { header: "Age Band", width: 90, getValue: (r) => r.band },
      { header: "Females", width: 80, align: "right", getValue: (r) => String(r.females) },
      { header: "Males", width: 80, align: "right", getValue: (r) => String(r.males) },
      { header: "Total", width: 80, align: "right", getValue: (r) => String(r.total) },
      { header: "Avg Risk Factor", width: 100, align: "right", getValue: (r) => r.avgRisk.toFixed(3) },
    ];

    y = drawTable(doc, y, bandColumns, bandRows, { fontSize: 9, rowHeight: 18 });

    // Totals row
    y += 2;
    doc.save();
    doc.rect(50, y, 430, 20).fill(COLORS.primary);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.white);
    doc.text("ALL AGES", 54, y + 5, { width: 86 });
    doc.text(String(totalF), 140, y + 5, { width: 76, align: "right" });
    doc.text(String(totalM), 220, y + 5, { width: 76, align: "right" });
    doc.text(String(totalCount), 300, y + 5, { width: 76, align: "right" });
    doc.text(totalCount > 0 ? (totalRisk / totalCount).toFixed(3) : "-", 380, y + 5, { width: 96, align: "right" });
    doc.restore();

    y += 35;

    // Risk tier scale
    doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.primary);
    doc.text("Risk Factor Scale", 50, y);
    y += 16;

    const scaleW = pageW / 3;
    // Preferred
    doc.rect(50, y, scaleW - 5, 25).fill("#c6f6d5");
    doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.success);
    doc.text("PREFERRED", 55, y + 3);
    doc.font("Helvetica").fontSize(7).fillColor(COLORS.success);
    doc.text("Below 1.000", 55, y + 14);
    // Standard
    doc.rect(50 + scaleW, y, scaleW - 5, 25).fill("#fefcbf");
    doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.warning);
    doc.text("STANDARD", 55 + scaleW, y + 3);
    doc.font("Helvetica").fontSize(7).fillColor(COLORS.warning);
    doc.text("1.000 – 1.499", 55 + scaleW, y + 14);
    // High
    doc.rect(50 + scaleW * 2, y, scaleW - 5, 25).fill("#fed7d7");
    doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.danger);
    doc.text("HIGH", 55 + scaleW * 2, y + 3);
    doc.font("Helvetica").fontSize(7).fillColor(COLORS.danger);
    doc.text("1.500 and above", 55 + scaleW * 2, y + 14);

    // ═══════════════════════════════════════════════════════════
    // PAGE 3+, Census Detail
    // ═══════════════════════════════════════════════════════════
    doc.addPage();
    y = 40;

    doc.rect(0, 0, doc.page.width, 50).fill(COLORS.headerBg);
    doc.font("Helvetica-Bold").fontSize(14).fillColor(COLORS.white);
    doc.text("Member-Level Detail", 50, 16);
    doc.font("Helvetica").fontSize(9).fillColor("#a0c4e8");
    doc.text(`${data.group.companyName}  ·  ${data.summary.totalLives} Members`, 50, 34);

    y = 65;

    const memberColumns: TableColumn[] = [
      { header: "Name", width: 130, getValue: (m: MemberRate) => `${m.lastName}, ${m.firstName}` },
      { header: "Type", width: 60, align: "center", getValue: (m: MemberRate) => formatRelationship(m.relationship) },
      { header: "DOB", width: 72, align: "center", getValue: (m: MemberRate) => m.dateOfBirth },
      { header: "Age", width: 40, align: "center", getValue: (m: MemberRate) => String(m.age) },
      { header: "Gender", width: 55, align: "center", getValue: (m: MemberRate) => m.gender },
      { header: "Zip", width: 55, align: "center", getValue: (m: MemberRate) => m.zipCode },
      { header: "Risk Factor", width: 70, align: "right", getValue: (m: MemberRate) => m.riskFactor.toFixed(3) },
    ];

    y = drawTable(doc, y, memberColumns, data.members, { fontSize: 7.5, rowHeight: 15 });

    // ═══════════════════════════════════════════════════════════
    // Footer on every page
    // ═══════════════════════════════════════════════════════════
    const pageCount = (doc as any).bufferedPageRange?.()?.count || 3;
    for (let p = 0; p < pageCount; p++) {
      // PDFKit doesn't easily support per-page footers after the fact,
      // so we'll add footer to the current (last) page
    }

    // Add footer to current page
    const footerY = doc.page.height - 35;
    doc.font("Helvetica").fontSize(7).fillColor(COLORS.muted);
    doc.text(
      `BenSync  |  Proposal for ${data.group.companyName}  |  Generated ${formatDate(new Date())}`,
      50, footerY, { width: pageW, align: "center" }
    );
    doc.text(
      "This proposal is for informational purposes only and does not constitute a binding offer.",
      50, footerY + 10, { width: pageW, align: "center" }
    );

    doc.end();

    stream.on("finish", () => {
      resolve({ filePath, fileName });
    });
    stream.on("error", reject);
  });
}

// ─── Summary Card Helper ──────────────────────────────────────────────────

function drawSummaryCard(
  doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number,
  label: string, value: string, color: string
) {
  doc.save();
  doc.roundedRect(x, y, w, h, 4).lineWidth(1).strokeColor(COLORS.light).stroke();
  doc.rect(x, y, 5, h).fill(color);
  doc.font("Helvetica").fontSize(9).fillColor(COLORS.muted);
  doc.text(label, x + 15, y + 10, { width: w - 25 });
  doc.font("Helvetica-Bold").fontSize(14).fillColor(COLORS.text);
  doc.text(value, x + 15, y + 28, { width: w - 25 });
  doc.restore();
}
