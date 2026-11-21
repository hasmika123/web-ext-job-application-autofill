import { describe, expect, it, vi } from "vitest";

const { getDocument, createWorker } = vi.hoisted(() => ({
  getDocument: vi.fn(),
  createWorker: vi.fn(),
}));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument,
}));

vi.mock("tesseract.js", () => ({ createWorker }));

import { parseResume } from "@/lib/resume-parse";

function emptyTextPdf() {
  return {
    numPages: 1,
    getPage: vi.fn(async () => ({
      getTextContent: vi.fn(async () => ({ items: [] })),
      getViewport: vi.fn(() => ({ width: 100, height: 140 })),
      render: vi.fn(() => ({ promise: Promise.resolve() })),
    })),
  };
}

describe("local OCR resume parsing", () => {
  it("fills contact fields when an image-only PDF has no selectable text", async () => {
    getDocument.mockReturnValue({ promise: Promise.resolve(emptyTextPdf()) });
    createWorker.mockResolvedValue({
      recognize: vi.fn(async () => ({
        data: {
          text: "Ada Lovelace\nada@example.test\n+1 (415) 555-0199\nSoftware engineer",
        },
      })),
      terminate: vi.fn(async () => undefined),
    });

    const file = new File(["synthetic image-only PDF"], "scanned-resume.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(0) });
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
    try {
      const parsed = await parseResume(file);

      expect(parsed.rawText).toContain("Ada Lovelace");
      expect(parsed.bio).toMatchObject({
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.test",
        phone: "+1 (415) 555-0199",
      });
      expect(createWorker).toHaveBeenCalledWith(
        "eng",
        1,
        expect.objectContaining({
          workerPath: "http://localhost:3000/ocr/worker.min.js",
          corePath: "http://localhost:3000/ocr/tesseract-core-lstm.wasm.js",
          langPath: "http://localhost:3000/ocr",
          workerBlobURL: false,
        }),
      );
    } finally {
      getContext.mockRestore();
    }
  });
});
