/**
 * Client-side fetchers for the resume photo BFF (`/api/resumes/[id]/photo`, R7.4). Browser code only; each fetcher maps
 * the HTTP outcome to a small tagged result so callers branch on `kind`, never on status numbers. Never throws.
 */
import type { ResumeDocDTO } from "@/lib/resume-doc";

export type PhotoResult =
  /** `version` = the response's ETag: the `If-Match` of the next content save. */
  | { kind: "ok"; dto: ResumeDocDTO; version: number }
  | { kind: "error"; status: number; code: string | null; message: string };

interface Problem {
  code?: string;
  title?: string;
  message?: string;
  detail?: string;
  error?: string;
  maxBytes?: number;
}

const MB = 1024 * 1024; // config-literal-ok: unit conversion for a message

/** What to tell the person about a refused upload, from the API's code. */
export function photoErrorMessage(status: number, p: Problem | null): string {
  switch (p?.code) {
    case "PHOTO_TOO_LARGE":
      return typeof p.maxBytes === "number" ? `That picture is too large (the limit is ${Math.max(1, Math.round((p.maxBytes / MB) * 10) / 10)} MB).` : "That picture is too large.";
    case "PHOTO_FORMAT":
      return "Use a JPEG, PNG or WebP picture.";
    case "FEATURE_DISABLED":
      return "Photos are switched off right now.";
    case "RATE_LIMITED":
      return "Too many uploads - try again in a moment.";
  }
  if (status === 401) return "Your session expired - please sign in again.";
  if (status === 404) return "That resume is no longer there.";
  const own = p?.message && p.message !== "error.resumeDoc" ? p.message : (p?.error ?? p?.detail ?? p?.title);
  return own || "Couldn't save the photo.";
}

async function readProblem(res: Response): Promise<Problem | null> {
  try {
    return (await res.json()) as Problem;
  } catch {
    return null;
  }
}

async function readOk(res: Response): Promise<PhotoResult> {
  const dto = (await res.json().catch(() => null)) as ResumeDocDTO | null;
  const etag = res.headers.get("etag");
  const fromEtag = etag ? Number(etag.replace(/^W\//, "").replace(/"/g, "")) : Number.NaN;
  const version = Number.isFinite(fromEtag) ? fromEtag : dto?.docVersion;
  if (!dto || typeof version !== "number") return { kind: "error", status: res.status, code: null, message: "The server's answer was incomplete." };
  return { kind: "ok", dto, version };
}

async function send(path: string, init: RequestInit): Promise<PhotoResult> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, cache: "no-store" });
  } catch {
    return { kind: "error", status: 0, code: null, message: "Couldn't reach the server." };
  }
  if (res.ok) return readOk(res);
  const p = await readProblem(res);
  return { kind: "error", status: res.status, code: p?.code ?? null, message: photoErrorMessage(res.status, p) };
}

/** `POST /api/resumes/:id/photo` (multipart `file`): add or replace the photo. The answer is the saved document. */
export function uploadPhoto(resumeId: number, file: Blob, fileName = "photo.png"): Promise<PhotoResult> {
  const form = new FormData();
  form.set("file", file, fileName);
  return send(`/api/resumes/${resumeId}/photo`, { method: "POST", body: form });
}

/** `DELETE /api/resumes/:id/photo`: remove the photo. The answer is the saved document. */
export function removePhoto(resumeId: number): Promise<PhotoResult> {
  return send(`/api/resumes/${resumeId}/photo`, { method: "DELETE" });
}

/** The stored photo's bytes (the browser's cache usually has them), so a removal can be undone; null when unreadable. */
export async function fetchPhotoBlob(resumeId: number): Promise<Blob | null> {
  try {
    const res = await fetch(`/api/resumes/${resumeId}/photo`);
    return res.ok ? await res.blob() : null;
  } catch {
    return null;
  }
}

/** Where the editor draws the stored photo from; `version` (the photo's `updatedAt`) makes a replaced photo a new address. */
export function photoUrl(resumeId: number, version?: string | null): string {
  return `/api/resumes/${resumeId}/photo${version ? `?v=${encodeURIComponent(version)}` : ""}`;
}
