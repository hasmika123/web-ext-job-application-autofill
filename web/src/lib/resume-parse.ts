/**
 * In-browser resume file → structured fields.
 *
 * The file→text extraction half (pdf.js / mammoth) — the web app's equivalent of the
 * extension's `parser.js` I/O layer. Text is then structured by the SHARED `parser-core`
 * so the web app and the extension produce identical results. Everything runs in the
 * user's browser (libs are dynamically imported on demand, never on the server), which
 * keeps resume content off our servers until the user chooses to save.
 */
import {
  heuristicStructure,
  parseBio,
  reconstructPdfText,
  cleanForLlm,
  looksGarbled,
  type StructuredResume,
  type ParsedBio,
} from "@/lib/parser-core";

export interface ParsedResume {
  structured: StructuredResume;
  bio: ParsedBio;
  rawText: string;
  /** How the structure was produced: server-side AI, or the local heuristic parser. */
  source?: "ai" | "heuristic";
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
    source: "heuristic",
  };
}

// --- Server-side AI parsing (opt-in) ----------------------------------------

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const objArr = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : [];

/** Coerce the server's LLM output (schema-enforced, but defensive anyway) into the
 *  canonical StructuredResume — same shape the heuristic produces. */
function coerceStructured(p: Record<string, unknown>): StructuredResume {
  return {
    summary: str(p.summary),
    skills: strArr(p.skills),
    experience: objArr(p.experience).map((e) => ({
      company: str(e.company),
      title: str(e.title),
      location: str(e.location),
      startDate: str(e.startDate),
      endDate: str(e.endDate),
      current: e.current === true,
      bullets: strArr(e.bullets),
    })),
    education: objArr(p.education).map((e) => ({
      school: str(e.school),
      degree: str(e.degree),
      field: str(e.field),
      location: str(e.location),
      startDate: str(e.startDate),
      endDate: str(e.endDate),
      gpa: str(e.gpa),
    })),
    languages: objArr(p.languages).map((l) => ({ name: str(l.name), proficiency: str(l.proficiency) })),
    projects: objArr(p.projects).map((pr) => ({ name: str(pr.name), bullets: strArr(pr.bullets) })),
  };
}

/** LLM bio, with the regex header-parse filling any field the model left blank
 *  (the heuristic also normalizes state to its full name for the Bio dropdown). */
function coerceBio(p: Record<string, unknown>, fallback: ParsedBio): ParsedBio {
  const b = (p.bio && typeof p.bio === "object" ? p.bio : {}) as Record<string, unknown>;
  const pick = (k: keyof ParsedBio): string | undefined => str(b[k]) || fallback[k];
  return {
    firstName: pick("firstName"),
    lastName: pick("lastName"),
    email: pick("email"),
    phone: pick("phone"),
    linkedin: pick("linkedin"),
    github: pick("github"),
    website: pick("website"),
    city: pick("city"),
    // The Bio form's state dropdown wants the full state name; the heuristic already
    // resolves "GA" → "Georgia", so prefer it when present.
    state: fallback.state || str(b.state) || undefined,
  };
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/**
 * Server-first pipeline (requires the user's AI-parsing opt-in): extract text in the
 * browser, clean it, and send it to POST /api/ai/parse-resume. When a PDF's extracted
 * text looks garbled (scanned / broken glyph maps / shredded columns), the original
 * file is sent instead so the model reads the layout itself. Any failure — disabled,
 * quota, network, 5xx — falls back to the local heuristic parse, never blocking the
 * upload flow.
 */
export async function parseResumeWithAi(file: File): Promise<ParsedResume> {
  const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
  let rawText = "";
  try {
    rawText = await extractText(file);
  } catch {
    // Unreadable in-browser (e.g. odd PDF) — a PDF can still go to the server whole.
    if (!isPdf) throw new Error("Couldn't read that file.");
  }

  const useFile = isPdf && looksGarbled(rawText);
  const body = useFile
    ? { fileBase64: await fileToBase64(file), fileMimeType: "application/pdf", consent: true }
    : { text: cleanForLlm(rawText), consent: true };

  try {
    const res = await fetch("/api/ai/parse-resume", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok && data.parsed && typeof data.parsed === "object") {
      const parsed = data.parsed as Record<string, unknown>;
      const fallbackBio = rawText ? parseBio(rawText) : {};
      return {
        structured: coerceStructured(parsed),
        bio: coerceBio(parsed, fallbackBio),
        rawText,
        source: "ai",
      };
    }
  } catch {
    // network failure → heuristic below
  }

  // Anything short of a successful AI parse: use the local heuristic.
  return {
    structured: heuristicStructure(rawText),
    bio: parseBio(rawText),
    rawText,
    source: "heuristic",
  };
}
