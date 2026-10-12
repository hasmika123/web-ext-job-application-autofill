/**
 * Client-side fetchers for the Resume Builder BFF (`/api/resumes/built`, `/api/resumes/[id]/doc`,
 * `…/doc/template`). Browser code only ever calls these Next routes; the Spring API is never
 * contacted directly. Each fetcher maps the HTTP outcome to a small tagged result so callers (the
 * autosave controller, the "New resume" button) branch on `kind`, never on status numbers.
 */
import type { ResumeDocument, ResumeTheme } from "@kiwiply/ui";

/** `ResumeDocDTO` from the API (DESIGN 6.2). */
export interface ResumeDocDTO {
  resumeId: number;
  label: string;
  kind: "BUILT" | "UPLOADED";
  doc: ResumeDocument;
  templateId: string;
  theme: Partial<ResumeTheme> | null;
  docVersion: number;
  contentHash: string | null;
  profileSyncedAt: string | null;
  exportedAt: string | null;
  exportedHash: string | null;
  updatedAt: string | null;
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
