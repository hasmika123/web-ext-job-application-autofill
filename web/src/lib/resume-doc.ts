/**
 * Client-side fetchers for the Resume Builder BFF (`/api/resumes/built`, `/api/resumes/[id]/doc`,
 * `…/doc/template`). Browser code only ever calls these Next routes; the Spring API is never
 * contacted directly. Each fetcher maps the HTTP outcome to a small tagged result so callers (the
 * autosave controller, the "New resume" button) branch on `kind`, never on status numbers.
 */
import type { ResumeDocument, ResumeTheme } from "@kiwiply/ui";

/** The stored PDF's job state (DESIGN 8.5). `STALE` = READY but behind the document. */
export type PdfStatus = "NONE" | "PENDING" | "RUNNING" | "READY" | "FAILED" | "STALE";

/** `ResumeDocDTO.pdf` / `ResumeDTO.pdf` / `GET .../doc/pdf-status`. */
export interface PdfInfo {
  status: PdfStatus;
  /** Render hash of the stored PDF. */
  hash?: string | null;
  generatedAt?: string | null;
  attempts?: number;
  error?: string | null;
  /** Editor endpoints only: how often to ask again, and for how long after the last save (both settings). */
  pollMs?: number | null;
  pollWindowMs?: number | null;
}

/** The PDF is being (re)made: PENDING, RUNNING or behind the document. */
export const pdfIsUpdating = (s: PdfStatus | undefined | null) => s === "PENDING" || s === "RUNNING" || s === "STALE";

/** `ResumeDocDTO` from the API (DESIGN 6.2). */
export interface ResumeDocDTO {
  resumeId: number;
  label: string;
  kind: "BUILT" | "UPLOADED";
  doc: ResumeDocument;
  /** The schema of `doc` - always 2; a stored v1 document is upgraded by the API on read. */
  schemaVersion: number;
  templateId: string;
  theme: Partial<ResumeTheme> | null;
  docVersion: number;
  contentHash: string | null;
  profileSyncedAt: string | null;
  exportedAt: string | null;
  exportedHash: string | null;
  updatedAt: string | null;
  /** What the PDF would be rendered from now (R3.7); `pdf.hash` equal to it means the stored PDF is current. */
  renderHash?: string | null;
  /** The stored PDF's state (R3.7). Absent on an older API. */
  pdf?: PdfInfo | null;
}

/** The minimal slice of `ResumeDTO` the list needs after creating a resume. */
export interface BuiltResumeDTO {
  resume: { id: number; label: string };
  doc: ResumeDocDTO;
}

export type SaveResult =
  | { kind: "ok"; version: number; contentHash: string | null }
  /** Someone else saved first: `doc` is the server's current document. */
  | { kind: "conflict"; serverVersion: number; doc: ResumeDocument }
  /** 422: the first problem the validator found. Not retried; the next edit retries. */
  | { kind: "invalid"; path: string; message: string }
  /** Transient (network, 5xx, 429): retry with backoff. */
  | { kind: "network" }
  /** Won't succeed by retrying (401/403/404/413/428...). */
  | { kind: "fatal"; status: number; code?: string; message: string };

interface Problem {
  code?: string;
  message?: string;
  detail?: string;
  error?: string;
  path?: string;
  serverVersion?: number;
  doc?: ResumeDocument;
}

/** Parses an `ETag: "7"` (optionally weak `W/"7"`) into 7; `null` when absent or not a number. */
export function parseEtag(etag: string | null | undefined): number | null {
  if (!etag) return null;
  const m = /^(?:W\/)?"?(\d+)"?$/.exec(etag.trim());
  return m ? Number(m[1]) : null;
}

/** The `If-Match` value for a version. */
export const ifMatch = (version: number) => `"${version}"`;

async function readJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** `PUT /api/resumes/:id/doc` with `If-Match`. Never throws. */
export async function putDoc(
  resumeId: number,
  version: number,
  body: { doc: ResumeDocument; theme?: Partial<ResumeTheme> | null },
  signal?: AbortSignal,
): Promise<SaveResult> {
  let res: Response;
  try {
    res = await fetch(`/api/resumes/${resumeId}/doc`, {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": ifMatch(version) },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    return { kind: "network" };
  }

  if (res.ok) {
    const dto = await readJson<ResumeDocDTO>(res);
    const version = parseEtag(res.headers.get("etag")) ?? dto?.docVersion;
    if (typeof version !== "number") return { kind: "network" }; // 200 without a version: don't trust it
    return { kind: "ok", version, contentHash: dto?.contentHash ?? null };
  }

  const p = (await readJson<Problem>(res)) ?? {};
  if (res.status === 409 && p.code === "DOC_VERSION_CONFLICT" && p.doc && typeof p.serverVersion === "number") {
    return { kind: "conflict", serverVersion: p.serverVersion, doc: p.doc };
  }
  if (res.status === 422) {
    return { kind: "invalid", path: p.path ?? "$", message: p.message && p.message !== "error.resumeDoc" ? p.message : (p.detail ?? "The document is not valid.") };
  }
  if (res.status >= 500 || res.status === 429 || res.status === 408) return { kind: "network" };
  return {
    kind: "fatal",
    status: res.status,
    code: p.code,
    message:
      res.status === 401
        ? "Your session expired — please sign in again."
        : res.status === 413
          ? "This resume is too large to save."
          : res.status === 404
            ? "That resume is no longer there."
            : p.error ?? "Couldn't save this resume.",
  };
}

export type FetchDocResult = { kind: "ok"; dto: ResumeDocDTO; version: number } | { kind: "error"; status: number };

/** `GET /api/resumes/:id/doc`. Never throws. */
export async function getDoc(resumeId: number): Promise<FetchDocResult> {
  try {
    const res = await fetch(`/api/resumes/${resumeId}/doc`, { cache: "no-store" });
    if (!res.ok) return { kind: "error", status: res.status };
    const dto = await readJson<ResumeDocDTO>(res);
    const version = parseEtag(res.headers.get("etag")) ?? dto?.docVersion;
    if (!dto || typeof version !== "number") return { kind: "error", status: 502 };
    return { kind: "ok", dto, version };
  } catch {
    return { kind: "error", status: 0 };
  }
}

export type CreateBuiltResult =
  | { kind: "ok"; id: number }
  /** 402 RESUME_LIMIT: the plan's resume cap. `plan` says which copy to show. */
  | { kind: "limit"; plan?: string; message: string }
  | { kind: "error"; message: string };

/** `POST /api/resumes/built`. Never throws. */
export async function createBuilt(body: { templateId?: string; target?: string; label?: string } = {}): Promise<CreateBuiltResult> {
  try {
    const res = await fetch("/api/resumes/built", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await readJson<Problem & Partial<BuiltResumeDTO> & { plan?: string }>(res);
    if (res.status === 402) {
      return {
        kind: "limit",
        plan: data?.plan,
        message: data?.detail ?? data?.error ?? "You've reached your resume limit.",
      };
    }
    if (res.status === 401) return { kind: "error", message: "Your session expired — please sign in again." };
    if (res.status === 403) return { kind: "error", message: data?.error ?? "This account can't create resumes." };
    const id = data?.resume?.id ?? data?.doc?.resumeId;
    if (!res.ok || typeof id !== "number") {
      return { kind: "error", message: data?.error ?? "Couldn't create the resume. Please try again." };
    }
    return { kind: "ok", id };
  } catch {
    return { kind: "error", message: "Couldn't reach the server." };
  }
}

/* ── PDF export (R0.6) ───────────────────────────────────────────────────────────────────── */

export type ExportPdfResult =
  | {
      kind: "ok";
      blob: Blob;
      fileName: string;
      pages: number;
      /** The PDF has no more pages than the target (the ladder succeeded). */
      fits: boolean;
      /** The PDF was also stored on the resume (the extension can attach it). */
      stored: boolean;
      contentHash: string | null;
      /** Served from the stored file (it was current), no render happened. */
      cached: boolean;
    }
  | { kind: "error"; status: number; code?: string; message: string };

/** `Content-Disposition: attachment; filename="x.pdf"` -> `x.pdf`. */
export function fileNameFromDisposition(header: string | null, fallback: string): string {
  const m = header ? /filename="?([^";]+)"?/i.exec(header) : null;
  return m?.[1] || fallback;
}

/**
 * `GET /api/resumes/:id/export?format=pdf&cached=1`. Returns the PDF of the SAVED document (flush the
 * editor's autosave first): the stored file when it is current (R3.7 - no render), otherwise the server renders
 * it synchronously and stores it through the same path. Never throws.
 */
export async function exportPdf(resumeId: number): Promise<ExportPdfResult> {
  let res: Response;
  try {
    res = await fetch(`/api/resumes/${resumeId}/export?format=pdf&cached=1`, { cache: "no-store" });
  } catch {
    return { kind: "error", status: 0, message: "Couldn't reach the server." };
  }
  if (res.ok) {
    const blob = await res.blob();
    return {
      kind: "ok",
      blob,
      fileName: fileNameFromDisposition(res.headers.get("content-disposition"), `resume-${resumeId}.pdf`),
      pages: Number(res.headers.get("x-resume-pdf-pages")) || 1,
      fits: res.headers.get("x-resume-pdf-fits") !== "0",
      stored: res.headers.get("x-resume-pdf-stored") === "1",
      contentHash: res.headers.get("x-resume-content-hash") || null,
      cached: res.headers.get("x-resume-pdf-cached") === "1",
    };
  }
  const p = (await readJson<Problem>(res)) ?? {};
  const message =
    res.status === 401
      ? "Your session expired - please sign in again."
      : res.status === 404
        ? "That resume is no longer there."
        : res.status === 429
          ? "Too many exports - try again in a moment."
          : (p.error ?? "Couldn't make the PDF. Please try again.");
  return { kind: "error", status: res.status, code: p.code, message };
}

export type ExportTextResult =
  | { kind: "ok"; blob: Blob; fileName: string }
  | { kind: "error"; status: number; message: string };

/**
 * `GET /api/resumes/:id/export?format=txt`: the document as plain text (what an ATS reads), made
 * from the SAVED document, so flush the editor's autosave first. Never throws.
 */
export async function exportText(resumeId: number): Promise<ExportTextResult> {
  let res: Response;
  try {
    res = await fetch(`/api/resumes/${resumeId}/export?format=txt`, { cache: "no-store" });
  } catch {
    return { kind: "error", status: 0, message: "Couldn't reach the server." };
  }
  if (res.ok) {
    return {
      kind: "ok",
      blob: await res.blob(),
      fileName: fileNameFromDisposition(res.headers.get("content-disposition"), `resume-${resumeId}.txt`),
    };
  }
  const p = (await readJson<Problem>(res)) ?? {};
  const message =
    res.status === 401
      ? "Your session expired - please sign in again."
      : res.status === 404
        ? "That resume is no longer there."
        : res.status === 429
          ? "Too many downloads - try again in a moment."
          : (p.error ?? "Couldn't make the text file. Please try again.");
  return { kind: "error", status: res.status, message };
}

/* ── async PDF pipeline (R3.7) ───────────────────────────────────────────────────────────── */

/** `GET /api/resumes/:id/doc/pdf-status`; `null` on any failure (the caller just tries again later). Never throws. */
export async function getPdfStatus(resumeId: number, signal?: AbortSignal): Promise<PdfInfo | null> {
  try {
    const res = await fetch(`/api/resumes/${resumeId}/doc/pdf-status`, { cache: "no-store", signal });
    if (!res.ok) return null;
    const body = await readJson<PdfInfo>(res);
    return body && typeof body.status === "string" ? body : null;
  } catch {
    return null;
  }
}

/**
 * `POST /api/resumes/:id/doc/pdf-now`: make the PDF now instead of after the settle delay. `keepalive` lets
 * the request outlive the page (leaving the editor). Resolves true when the server accepted it. Never throws.
 */
export async function requestPdfNow(resumeId: number, opts: { keepalive?: boolean } = {}): Promise<boolean> {
  try {
    const res = await fetch(`/api/resumes/${resumeId}/doc/pdf-now`, { method: "POST", keepalive: opts.keepalive === true });
    return res.ok;
  } catch {
    return false;
  }
}

/** Saves a blob through a temporary link (the browser's normal download). */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** The list's "PDF out of date" test: a PDF was exported once, and the content has moved on since. */
export function pdfOutOfDate(r: { kind?: string | null; contentHash?: string | null; exportedHash?: string | null }): boolean {
  return r.kind === "BUILT" && !!r.exportedHash && !!r.contentHash && r.exportedHash !== r.contentHash;
}
