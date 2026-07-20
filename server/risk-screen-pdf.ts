/**
 * BenSync Risk Screen - single-page PDF renderer.
 *
 * Hard one-page layout for US Letter. Every band has a fixed y-budget
 * so content never spills to a second page even at maximum width.
 */
import PDFDocument from "pdfkit";
import type { ScreenResult, RiskTier } from "./risk-screen";
import type { UnderwriterReview } from "./ai-underwriter-review";

export interface RenderOpts {
  groupName?: string;
  advisor?: string;
  censusId?: string;
}

// Bump whenever the visual output of renderRiskScreenPDF changes in a way
// that should retroactively apply to already-stored PDFs. The startup
// backfill (server/backfill-screen-pdfs.ts) re-renders any stored screen
// whose stamped version is older than this, then leaves it alone.
//   1 = original layout
//   2 = AI Adjustment box keys off whether the model ran, not |adj| < 0.5%
//   3 = AI Underwriter Review band (Claude, advisory) above the decision strip
//   4 = Claude review replaces the AI Summary section when present (one AI
//       section, no separate band)
//   5 = review simplified to a single underwriting note; approve/decline
//       sub-line derived from the screen decision, not the AI
export const PDF_RENDER_VERSION = 5;

const COLORS = {
  preferred: "#0F8A4A",
  standard:  "#1F5BB5",
  highRisk:  "#B83A2A",
  text:      "#1A1A1A",
  muted:     "#6B7280",
  border:    "#D1D5DB",
  median:    "#9CA3AF",
};

function tierColor(t: RiskTier): string {
  if (t === "Preferred") return COLORS.preferred;
  if (t === "High Risk") return COLORS.highRisk;
  return COLORS.standard;
}

function pct(n: number, d = 0): string {
  return (n * 100).toFixed(d) + "%";
}

export function renderRiskScreenPDF(result: ScreenResult, opts: RenderOpts = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 36, autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = doc.page.width;
    const H = doc.page.height;
    const M = 36;
    const innerW = W - 2 * M;

    // Header strip
    let y = M;
    const pillW = 165, pillH = 56;
    const pillX = W - M - pillW;

    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(20)
       .text("BenSync Risk Screen", M, y);
    doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.muted)
       .text(`Model ${result.model_version}  ·  hash ${result.model_hash}`, M, y + 26);

    doc.roundedRect(pillX, y, pillW, pillH, 8)
       .fillColor(tierColor(result.tier)).fill();
    doc.fillColor("white").font("Helvetica-Bold").fontSize(13)
       .text(result.tier.toUpperCase(), pillX, y + 10, { width: pillW, align: "center" });
    doc.font("Helvetica-Bold").fontSize(20)
       .text(`Score ${result.kri.toFixed(2)}`, pillX, y + 28, { width: pillW, align: "center" });
    y += 72;

    // Meta strip
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(12)
       .text(opts.groupName || result.group || "Group", M, y);
    doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.muted);
    const meta = [
      opts.advisor ? `Advisor: ${opts.advisor}` : null,
      opts.censusId ? `Census ${opts.censusId.slice(0, 28)}` : null,
      `Effective ${result.effective_date}`,
      `Scored ${result.scored_at.slice(0, 16).replace("T", " ")} UTC`,
    ].filter(Boolean).join("  ·  ");
    doc.text(meta, M, y + 14, { width: innerW });
    y += 28;

    doc.moveTo(M, y).lineTo(W - M, y)
       .strokeColor(COLORS.border).lineWidth(0.5).stroke();
    y += 8;

    // Scorecard
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(10.5)
       .text("Score Breakdown", M, y);
    y += 16;

    const aiBoxW = 110;
    const aiBoxX = W - M - aiBoxW;
    const aiBoxY = y;
    const labelX = M;
    const labelW = 75;
    const barLeft = M + labelW + 6;
    const barRight = aiBoxX - 16;
    const valueW = 32;
    const barWidth = barRight - barLeft - valueW;

    function drawBar(label: string, normalized: number) {
      doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.text)
         .text(label, labelX, y + 3, { width: labelW });
      doc.roundedRect(barLeft, y + 4, barWidth, 11, 2)
         .fillColor("#E5E7EB").fill();
      const visualNorm = Math.min(Math.max(normalized, 0.5), 1.6);
      const fillW = Math.max(3, barWidth * ((visualNorm - 0.5) / 1.1));
      const color =
        normalized < 0.95 ? COLORS.preferred :
        normalized >= 1.5 ? COLORS.highRisk  :
                            COLORS.standard;
      doc.roundedRect(barLeft, y + 4, fillW, 11, 2).fillColor(color).fill();
      const medX = barLeft + barWidth * ((1.0 - 0.5) / 1.1);
      doc.dash(2, { space: 2 }).strokeColor(COLORS.median).lineWidth(0.75)
         .moveTo(medX, y + 2).lineTo(medX, y + 17).stroke()
         .undash();
      doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.text)
         .text(normalized.toFixed(2), barRight - valueW + 2, y + 5,
               { width: valueW, align: "right" });
      y += 22;
    }
    drawBar("Demographic", result.demographic.normalized);
    drawBar("Geographic",  result.geographic.normalized);
    drawBar("Composition", result.composition.normalized);

    const aiBoxH = 66;
    doc.roundedRect(aiBoxX, aiBoxY, aiBoxW, aiBoxH, 4)
       .strokeColor(COLORS.border).lineWidth(0.5).stroke();
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(COLORS.muted)
       .text("AI Adjustment", aiBoxX, aiBoxY + 6, { width: aiBoxW, align: "center" });
    const adj = result.ai_residual.clamped;
    // The placeholder ("Not yet active") belongs only when the residual model
    // genuinely didn't run, in that case screenGroup() leaves the drivers
    // array empty. A small-but-real adjustment (e.g. -0.2%) is still active
    // and must show its value, otherwise the box contradicts the Top Risk
    // Drivers list that already reports the AI residual on the same page.
    const modelActive = result.ai_residual.drivers.length > 0;
    const adjColor = !modelActive ? COLORS.muted
                   : adj > 0.01 ? COLORS.highRisk
                   : adj < -0.01 ? COLORS.preferred
                   : COLORS.text;
    doc.font("Helvetica-Bold").fontSize(modelActive ? 18 : 14).fillColor(adjColor)
       .text(modelActive ? `${adj >= 0 ? "+" : ""}${(adj * 100).toFixed(1)}%` : "Not yet active",
             aiBoxX, aiBoxY + (modelActive ? 22 : 26),
             { width: aiBoxW, align: "center" });
    doc.font("Helvetica").fontSize(7).fillColor(COLORS.muted)
       .text(modelActive
             ? "AI adjustment\nlimited to ±10%"
             : "Pending block calibration\n(activates in v1.1)",
             aiBoxX, aiBoxY + 48,
             { width: aiBoxW, align: "center" });

    y = Math.max(y, aiBoxY + aiBoxH) + 6;

    doc.moveTo(M, y).lineTo(W - M, y)
       .strokeColor(COLORS.border).lineWidth(0.5).stroke();
    y += 8;

    // Group profile
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(10.5)
       .text("Group Profile", M, y);
    y += 16;

    type Cell = { label: string; value: string; span?: number };
    const cells: Cell[] = [
      { label: "Total Lives",      value: String(result.n_members) },
      { label: "Employees",        value: String(result.n_employees) },
      { label: "Spouses",          value: String(result.n_spouses) },
      { label: "Children",         value: String(result.n_children) },
      { label: "Median Age",       value: String(result.median_age) },
      { label: "Avg Age",          value: result.avg_age.toFixed(1) },
      { label: "Female %",         value: pct(result.pct_female) },
      { label: "Medicare-Cliff %", value: pct(result.pct_medicare_cliff) },
      { label: "Family Tier %",    value: pct(
          (result.family_tier_mix.FAM) /
          Math.max(1, result.family_tier_mix.EE + result.family_tier_mix.ECH +
                      result.family_tier_mix.ESP + result.family_tier_mix.FAM)
        ) },
      { label: "Group Size",       value: result.n_employees < 20 ? "Small (<20 EE)" : result.n_employees < 100 ? "Mid" : "Large" },
      { label: "Tier Mix",         value:
          `EE ${result.family_tier_mix.EE}  ·  ECH ${result.family_tier_mix.ECH}  ·  ` +
          `ESP ${result.family_tier_mix.ESP}  ·  FAM ${result.family_tier_mix.FAM}`,
        span: 4 },
    ];
    const gridCols = 4;
    const gridColW = innerW / gridCols;
    const gridY = y;
    let col = 0, row = 0;
    for (const c of cells) {
      const span = c.span ?? 1;
      if (col + span > gridCols) { col = 0; row++; }
      const cx = M + col * gridColW;
      const cy = gridY + row * 28;
      const cellW = gridColW * span - 6;
      doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted)
         .text(c.label, cx, cy);
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor(COLORS.text)
         .text(c.value, cx, cy + 10, { width: cellW, height: 14, ellipsis: true });
      col += span;
      if (col >= gridCols) { col = 0; row++; }
    }
    const rowsUsed = row + (col > 0 ? 1 : 0);
    y = gridY + rowsUsed * 28 + 4;

    doc.moveTo(M, y).lineTo(W - M, y)
       .strokeColor(COLORS.border).lineWidth(0.5).stroke();
    y += 8;

    // AI Summary + Top Drivers. When the Claude underwriter review ran, it
    // replaces the deterministic AI Summary in this slot, one AI section on
    // the page, never two. The summary text stays stored in result_json.
    const review = (result as any).claude_review as UnderwriterReview | undefined;
    const colGap = 14;
    const summaryW = Math.floor(innerW * 0.45);
    const driversX = M + summaryW + colGap;
    const driversW = innerW - summaryW - colGap;

    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(10.5)
       .text(review ? "Underwriting Review" : "AI Summary", M, y);
    if (review) {
      // Sub-line mirrors the deterministic screen decision, never the AI.
      const approved = result.decision !== "DECLINE";
      doc.font("Helvetica-Bold").fontSize(8)
         .fillColor(approved ? COLORS.preferred : COLORS.highRisk)
         .text(approved ? "APPROVED TO QUOTE  ·  AI UNDERWRITER" : "DECLINED  ·  AI UNDERWRITER",
               M, y + 14, { width: summaryW });
      // summary (current shape) ?? narrative (reviews stored before v2)
      const noteText = (review.summary ?? (review as any).narrative ?? "").replace(/\s+/g, " ");
      doc.font("Helvetica").fontSize(9).fillColor(COLORS.text)
         .text(noteText, M, y + 26,
               { width: summaryW, height: 150, ellipsis: true, lineGap: 2 });
    } else {
      doc.font("Helvetica").fontSize(9).fillColor(COLORS.text)
         .text(result.ai_summary, M, y + 14,
               { width: summaryW, lineGap: 2 });
    }

    doc.font("Helvetica-Bold").fontSize(10.5).fillColor(COLORS.text)
       .text("Top Risk Drivers", driversX, y, { width: driversW });
    let dy = y + 14;
    if (!result.top_drivers || result.top_drivers.length === 0) {
      doc.font("Helvetica-Oblique").fontSize(9).fillColor(COLORS.muted)
         .text("Group scores near book median - no single factor dominates.",
               driversX, dy, { width: driversW });
    } else {
      for (const d of result.top_drivers) {
        const impactColor = d.impact > 0.01 ? COLORS.highRisk
                          : d.impact < -0.01 ? COLORS.preferred
                          : COLORS.muted;
        const chipW = 38;
        doc.font("Helvetica-Bold").fontSize(8.5).fillColor(impactColor)
           .text(`${d.impact >= 0 ? "+" : ""}${d.impact.toFixed(2)}`,
                 driversX, dy, { width: chipW });
        const txt = `${d.category}: ${d.text}`;
        const h = doc.heightOfString(txt, { width: driversW - chipW - 4, lineGap: 1 });
        doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.text)
           .text(txt, driversX + chipW + 4, dy,
                 { width: driversW - chipW - 4, lineGap: 1, height: h });
        dy += Math.max(h, 11) + 4;
        if (dy > y + 170) break;
      }
    }

    // Decision band (anchored bottom)
    const decisionY = H - M - 56;
    let decisionLabel: string;
    let decisionColor: string;
    if (result.decision === "DECLINE") {
      decisionLabel = "RECOMMENDATION:  DO NOT QUOTE";
      decisionColor = COLORS.highRisk;
    } else if (result.decision === "QUOTE_WITH_REVIEW") {
      decisionLabel = "RECOMMENDATION:  QUOTE WITH MANAGER REVIEW";
      decisionColor = COLORS.standard;
    } else {
      decisionLabel = "RECOMMENDATION:  QUOTE";
      decisionColor = COLORS.preferred;
    }
    doc.roundedRect(M, decisionY, innerW, 30, 4)
       .fillColor(decisionColor).fill();
    doc.fillColor("white").font("Helvetica-Bold").fontSize(13)
       .text(decisionLabel, M, decisionY + 10, { width: innerW, align: "center" });

    // Footer
    doc.font("Helvetica").fontSize(7).fillColor(COLORS.muted)
       .text(
         `BenSync Underwriting Portal  ·  proprietary AI engine  ·  model v${result.model_version}  ·  hash ${result.model_hash}`,
         M, H - M - 10, { width: innerW, align: "center", lineBreak: false }
       );

    doc.end();
  });
}
