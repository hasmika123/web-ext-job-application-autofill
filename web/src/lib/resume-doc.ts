import { upgradeFrom, type UpgradeHint } from "@/lib/subscription/upgrade";
/**
 * Client-side fetchers for the Resume Builder BFF (`/api/resumes/built`, `/api/resumes/[id]/doc`,
 * `…/doc/template`). Browser code only ever calls these Next routes; the Spring API is never
 * contacted directly. Each fetcher maps the HTTP outcome to a small tagged result so callers (the
 * autosave controller, the "New resume" button) branch on `kind`, never on status numbers.
 */
import type { ParsedBio, ResumeDocument, ResumeTheme, StructuredResume } from "@kiwiply/ui";

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

/** What a `PATCH …/doc/template` or `…/doc/theme` answered: the new version, or why not. */
export type PatchResult =
  /**
   * `version` = the response's ETag (the `If-Match` of the next content save); `theme` = the theme the
   * server stored (a template switch may have applied the new template's defaults, R3.4).
   */
  | { kind: "ok"; version: number; theme?: Partial<ResumeTheme> }
  /** 422: the value was refused (unknown/disabled template, theme out of bounds). */
  | { kind: "invalid"; message: string }
  | { kind: "error"; message: string };

async function patchPresentation(path: string, body: unknown): Promise<PatchResult> {
  let res: Response;
  try {
    res = await fetch(path, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    return { kind: "error", message: "Couldn't reach the server." };
  }
  if (res.ok) {
    const dto = await readJson<ResumeDocDTO>(res);
    const version = parseEtag(res.headers.get("etag")) ?? dto?.docVersion;
    return typeof version === "number" ? { kind: "ok", version, ...(dto?.theme ? { theme: dto.theme } : {}) } : { kind: "error", message: "The server's answer was incomplete." };
  }
  const p = (await readJson<Problem>(res)) ?? {};
  if (res.status === 422) return { kind: "invalid", message: p.message && p.message !== "error.resumeDoc" ? p.message : (p.detail ?? "That isn't allowed.") };
  if (res.status === 401) return { kind: "error", message: "Your session expired — please sign in again." };
  if (res.status === 404) return { kind: "error", message: "That resume is no longer there." };
  return { kind: "error", message: p.error ?? "Couldn't save that change." };
}

/**
 * `PATCH /api/resumes/:id/doc/template` (never touches the content; bumps the version). The server applies the
 * new template's theme defaults to the keys the user never touched; `theme` stores that exact theme instead
 * (the undo / redo of a switch restores template and theme in one request). Never throws.
 */
export function patchTemplate(resumeId: number, templateId: string, theme?: Partial<ResumeTheme> | null): Promise<PatchResult> {
  return patchPresentation(`/api/resumes/${resumeId}/doc/template`, theme ? { templateId, theme } : { templateId });
}

/** `PATCH /api/resumes/:id/doc/theme` (Customize Template; never touches the content; bumps the version). Never throws. */
export function patchTheme(resumeId: number, theme: Partial<ResumeTheme>): Promise<PatchResult> {
  return patchPresentation(`/api/resumes/${resumeId}/doc/theme`, { theme });
}

/** Which items of an uploaded resume the user left ticked (DESIGN 9.10): indexes into the structured arrays. */
export interface KeepMask {
  experience?: number[];
  education?: number[];
  projects?: number[];
  skills?: boolean;
  summary?: boolean;
}

/** Where a new built resume starts (DESIGN 9.10; the four chooser sources, DECISIONS #29). */
export type BuiltSource =
  | { kind: "profile" }
  | { kind: "scratch" }
  | { kind: "upload"; structured: StructuredResume; bio?: ParsedBio; fileName: string; keep?: KeepMask }
  | { kind: "copy"; fromResumeId: number };

export interface CreateBuiltBody {
  templateId?: string;
  target?: string;
  label?: string;
  /** Omitted = `profile`. */
  source?: BuiltSource;
}

export type CreateBuiltResult =
  | { kind: "ok"; id: number; orgResumeId?: number }
  /** 402 RESUME_LIMIT: the plan's resume cap. `plan` says which copy to show. */
  | { kind: "limit"; plan?: string; limit?: number; message: string; upgrade?: UpgradeHint | null }
  /** 422 SENSITIVE_CONTENT: a value the product never collects, and where (`structured.experience[1].bullets[0]`). */
  | { kind: "sensitive"; path: string; message: string }
  /** 422 DOC_INVALID / unknown template: the first thing the validator refused. */
  | { kind: "invalid"; path: string; message: string }
  | { kind: "error"; message: string };

/** `POST /api/resumes/built` (or the organization workspace's tenant-aware create, `url`). Never throws. */
export async function createBuilt(body: CreateBuiltBody = {}, url = "/api/resumes/built"): Promise<CreateBuiltResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await readJson<Problem & Partial<BuiltResumeDTO> & { plan?: string; limit?: number; resumeId?: number; orgResumeId?: number }>(res);
    if (res.status === 402) {
      return {
        kind: "limit",
        plan: data?.plan,
        limit: data?.limit,
        message: data?.detail ?? data?.error ?? "You've reached your resume limit.",
        upgrade: upgradeFrom(data),
      };
    }
    if (res.status === 401) return { kind: "error", message: "Your session expired — please sign in again." };
    if (res.status === 403) return { kind: "error", message: data?.error ?? "This account can't create resumes." };
    if (res.status === 404) return { kind: "error", message: "That resume is no longer there." };
    if (res.status === 422) {
      const message = data?.message && data.message !== "error.resumeDoc" ? data.message : (data?.detail ?? "That isn't allowed.");
      if (data?.code === "SENSITIVE_CONTENT") return { kind: "sensitive", path: data.path ?? "", message };
      return { kind: "invalid", path: data?.path ?? "$", message };
    }
    const id = data?.resume?.id ?? data?.doc?.resumeId ?? data?.resumeId;
    if (!res.ok || typeof id !== "number") {
      return { kind: "error", message: data?.error ?? "Couldn't create the resume. Please try again." };
    }
    return { kind: "ok", id, orgResumeId: typeof data?.orgResumeId === "number" ? data.orgResumeId : undefined };
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

/* ── checkpoints: Save / Save as version (R3.3 over R3.9) ─────────────────────────────────── */

export type CheckpointResult =
  /** The version row was written; `pdf` is the PDF job's state right after (the Save queued it at once). */
  | { kind: "ok"; versionNo: number; reason: string; pdf: PdfInfo | null }
  | { kind: "error"; status: number; message: string };

/**
 * `POST /api/resumes/:id/doc/checkpoint {name?}`: write a MANUAL (or NAMED) version of the SAVED document and
 * ask for its PDF now. Flush the editor's autosave first so the row snapshots what the user sees. Never throws.
 */
export async function checkpointDoc(resumeId: number, name?: string): Promise<CheckpointResult> {
  let res: Response;
  try {
    res = await fetch(`/api/resumes/${resumeId}/doc/checkpoint`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(name ? { name } : {}),
    });
  } catch {
    return { kind: "error", status: 0, message: "Couldn't reach the server." };
  }
  if (res.ok) {
    const body = await readJson<{ versionNo?: number; reason?: string; pdf?: PdfInfo | null }>(res);
    return {
      kind: "ok",
      versionNo: body?.versionNo ?? 0,
      reason: body?.reason ?? "MANUAL",
      pdf: body?.pdf && typeof body.pdf.status === "string" ? body.pdf : null,
    };
  }
  const p = (await readJson<Problem>(res)) ?? {};
  const message =
    res.status === 401
      ? "Your session expired - please sign in again."
      : res.status === 404
        ? "That resume is no longer there."
        : res.status === 422
          ? p.message && p.message !== "error.resumeDoc"
            ? p.message
            : (p.detail ?? "That name isn't allowed.")
          : res.status === 403
            ? (p.error ?? "This account can't save versions.")
            : (p.error ?? "Couldn't save a version. Please try again.");
  return { kind: "error", status: res.status, message };
}

export type PdfWaitResult = "ready" | "failed" | "timeout";

/**
 * Save & Download PDF: after a checkpoint queued the PDF, ask `pdf-status` every `pollMs` (the server's hint, a
 * setting) until it is READY, FAILED, or `waitMs` (`resume.pdf.waitMs`) is spent. "timeout" and "failed" both mean
 * the caller falls back to the synchronous export, which renders and stores the PDF itself. With no interval hint
 * from the server there is no polling (never guess one): the caller falls back at once. Never throws.
 */
export async function waitForStoredPdf(
  resumeId: number,
  opts: { waitMs: number; pollMs?: number | null; signal?: AbortSignal },
): Promise<PdfWaitResult> {
  const deadline = Date.now() + opts.waitMs;
  let pollMs = opts.pollMs ?? null;
  for (;;) {
    const info = await getPdfStatus(resumeId, opts.signal);
    if (opts.signal?.aborted) return "timeout";
    if (info?.status === "READY") return "ready";
    if (info?.status === "FAILED") return "failed";
    pollMs = info?.pollMs ?? pollMs;
    if (!pollMs || Date.now() + pollMs > deadline) return "timeout";
    await new Promise<void>((resolve) => setTimeout(resolve, pollMs ?? 0));
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
