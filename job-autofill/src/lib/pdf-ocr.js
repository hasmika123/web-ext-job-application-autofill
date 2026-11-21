/* pdf-ocr.js — local OCR adapter for the extension's resume parser.
 * The worker, WASM core and English model are copied into vendor/ocr at build time;
 * no resume bytes leave the extension for this path.
 */
(function () {
  const JAF = (window.JAF = window.JAF || {});
  const OCR_BASE = chrome.runtime.getURL("vendor/ocr/");
  const OCR_SCALE = 2;

  function makeCanvas(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width);
    canvas.height = Math.ceil(height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("OCR could not create a 2D canvas.");
    return { canvas, context };
  }

  async function createOcrWorker() {
    const { createWorker } = await import("tesseract.js");
    return createWorker("eng", 1, {
      workerPath: OCR_BASE + "worker.min.js",
      corePath: OCR_BASE + "tesseract-core-lstm.wasm.js",
      langPath: OCR_BASE,
      workerBlobURL: false,
      logger: () => undefined,
    });
  }

  async function ocrPdfDocument(doc) {
    const worker = await createOcrWorker();
    const pages = [];
    try {
      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
        const page = await doc.getPage(pageNumber);
        const viewport = page.getViewport({ scale: OCR_SCALE });
        const { canvas, context } = makeCanvas(viewport.width, viewport.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const result = await worker.recognize(canvas);
        const text = (result.data.text || "").trim();
        if (text) pages.push(text);
      }
    } finally {
      await worker.terminate();
    }
    return pages.join("\n\n").trim();
  }

  JAF.resumeOcr = { ocrPdfDocument };
})();
