import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Worker } from "tesseract.js";

const OCR_SCALE = 2;

function ocrAssetUrl(name: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/ocr/${name}`;
}

function ocrAssetDirectory(): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/ocr`;
}

function makeCanvas(width: number, height: number): {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
} {
  if (typeof document === "undefined") throw new Error("OCR requires a browser canvas.");
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("OCR could not create a 2D canvas.");
  return { canvas, context };
}

async function createOcrWorker(): Promise<Worker> {
  const { createWorker } = await import("tesseract.js");
  return createWorker("eng", 1, {
    workerPath: ocrAssetUrl("worker.min.js"),
    corePath: ocrAssetUrl("tesseract-core-lstm.wasm.js"),
    langPath: ocrAssetDirectory(),
    workerBlobURL: false,
    logger: () => undefined,
  });
}

/** Render each PDF page locally and run the bundled English OCR model over it. */
export async function ocrPdfDocument(doc: PDFDocumentProxy): Promise<string> {
  const worker = await createOcrWorker();
  const pages: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: OCR_SCALE });
      const { canvas, context } = makeCanvas(viewport.width, viewport.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const result = await worker.recognize(canvas);
      const text = result.data.text.trim();
      if (text) pages.push(text);
    }
  } finally {
    await worker.terminate();
  }
  return pages.join("\n\n").trim();
}
