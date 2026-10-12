/**
 * Runs once when the Next server starts. The only thing started here is the async resume-PDF worker
 * (Resume Builder R3.7), and only in the Node.js runtime and only when `RESUME_PDF_WORKER=1`: the Edge
 * runtime has no Chromium client and every other container simply skips it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.RESUME_PDF_WORKER !== "1") return;
  const { startPdfWorker } = await import("@/lib/pdf-jobs");
  startPdfWorker();
}
