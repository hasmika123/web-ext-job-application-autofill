/**
 * In-browser resume file → structured fields.
 *
 * The file→text extraction half (pdf.js / mammoth) — the web app's equivalent of the
 * extension's `parser.js` I/O layer. Text is then structured by the SHARED `parser-core`
 * so the web app and the extension produce identical results. Everything runs in the
 * user's browser (libs are dynamically imported on demand, never on the server), which
 * keeps resume content off our servers until the user chooses to save.
 */
import { heuristicStructure, parseBio, reconstructPdfText, type StructuredResume, type ParsedBio } from "@/lib/parser-core";

export interface ParsedResume {
  structured: StructuredResume;
  bio: ParsedBio;
  rawText: string;
}

async function extractPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  // Bundled worker — Turbopack resolves `new URL(..., import.meta.url)` to an asset.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  let out = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Hand positioned items to the shared column-aware reconstructor (matches the
    // extension) so two-column resumes read column-by-column instead of interleaving.
    // TextMarkedContent items carry no `str`, so filtering on it leaves only TextItems.
    type PdfItem = { str: string; transform: number[]; width: number };
    const items = (content.items as unknown as PdfItem[])
      .filter((it) => typeof it.str === "string" && it.str !== "")
      .map((it) => ({ x: it.transform[4], y: it.transform[5], w: it.width, str: it.str }));
    out += reconstructPdfText(items) + "\n\n";
  }
  return out.trim();
}

async function extractDocx(file: File): Promise<string> {
  // mammoth uses `export =`, so the module is on `.default` under esModuleInterop.
  const mammoth = (await import("mammoth")).default;
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return (result.value || "").trim();
}

/** Extract plain text from a resume file (PDF / DOCX / TXT), in the browser. */
export async function extractText(file: File): Promise<string> {
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") return extractPdf(file);
  if (name.endsWith(".docx")) return extractDocx(file);
  if (name.endsWith(".txt") || file.type === "text/plain") return file.text();
  if (name.endsWith(".doc")) {
    throw new Error("Legacy .doc isn't supported — please save as .docx or a PDF.");
  }
  return file.text();
}

/** Full pipeline: file → text → structured resume + bio, all in the browser. */
export async function parseResume(file: File): Promise<ParsedResume> {
  const rawText = await extractText(file);
  return {
    structured: heuristicStructure(rawText),
    bio: parseBio(rawText),
    rawText,
  };
}
