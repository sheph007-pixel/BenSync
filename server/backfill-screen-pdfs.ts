/**
 * One-time, self-limiting backfill for stored Risk Screen PDFs.
 *
 * When the PDF renderer changes (PDF_RENDER_VERSION bumps), already-stored
 * PDFs in risk_screens are stale, they were rendered by the old code and
 * sit frozen in the DB as base64. The score data in resultJson is unchanged,
 * so we can simply re-render each PDF from its stored result and overwrite
 * pdfBase64. Each row is stamped with the render version it was last built
 * at (resultJson._pdfRenderVersion); rows already at the current version are
 * skipped, so this is idempotent and costs nothing on subsequent boots.
 *
 * Runs at startup (server/index.ts), after migrations + seed. Non-fatal: any
 * failure is logged and the server continues to boot.
 */
import { storage } from "./storage";
import { renderRiskScreenPDF, PDF_RENDER_VERSION } from "./risk-screen-pdf";
import type { ScreenResult } from "./risk-screen";
import { log } from "./index";

export async function backfillScreenPdfs(): Promise<void> {
  let screens;
  try {
    screens = await storage.getAllRiskScreens();
  } catch (err: any) {
    log(`[backfill-screen-pdfs] could not list screens: ${err?.message || err}`);
    return;
  }

  const stale = screens.filter(
    (s) => ((s.resultJson as any)?._pdfRenderVersion ?? 1) < PDF_RENDER_VERSION,
  );
  if (stale.length === 0) {
    log(`[backfill-screen-pdfs] all ${screens.length} screen PDFs at v${PDF_RENDER_VERSION}, nothing to do`);
    return;
  }

  log(`[backfill-screen-pdfs] re-rendering ${stale.length} stale screen PDF(s) → v${PDF_RENDER_VERSION}`);
  let ok = 0;
  let failed = 0;
  for (const s of stale) {
    try {
      const result = s.resultJson as ScreenResult;
      // Pull display fields from the owning group; harmless if it's gone.
      const group = await storage.getGroup(s.groupId).catch(() => undefined);
      const pdfBuf = await renderRiskScreenPDF(result, {
        groupName: (group as any)?.companyName || (group as any)?.name,
        advisor: (group as any)?.advisorName || undefined,
        censusId: s.groupId,
      });
      const stamped = { ...(result as any), _pdfRenderVersion: PDF_RENDER_VERSION };
      await storage.updateRiskScreenPdf(s.id, pdfBuf.toString("base64"), stamped);
      ok++;
    } catch (err: any) {
      failed++;
      log(`[backfill-screen-pdfs] screen ${s.id} failed: ${err?.message || err}`);
    }
  }
  log(`[backfill-screen-pdfs] done, ${ok} updated, ${failed} failed`);
}
