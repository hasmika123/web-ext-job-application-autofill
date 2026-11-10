/**
 * Runs once when the Next server starts, in the Node.js runtime only (the Edge runtime has no Chromium client).
 *   - With `PDF_BROWSER_URL`: warm the Chromium sidecar in the background (Resume Builder), so the first PDF export after
 *     a start or deploy does not pay for a cold browser launch. Not awaited: the server never waits on it.
 *   - With `RESUME_PDF_WORKER=1`: start the async resume-PDF worker (R3.7).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.PDF_BROWSER_URL) {
    const { warmPdfBrowser } = await import("@/lib/pdf");
    void warmPdfBrowser();
  }
  if (process.env.RESUME_PDF_WORKER !== "1") return;
  const { startPdfWorker } = await import("@/lib/pdf-jobs");
  startPdfWorker();
}
