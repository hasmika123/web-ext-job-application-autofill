/**
 * Client-side fetchers for what the "My Resumes" list does to a resume (Resume Builder R2.6): duplicate,
 * open an uploaded file in the builder, rename / set primary / archive (the metadata PATCH of R3.9), delete,
 * and attach the uploaded original to a resume made from it. Browser code only calls the Next BFF
 * (`/api/resumes/**`); each fetcher maps the HTTP outcome to a small tagged result and never throws.
 */
import type { CreateBuiltResult } from "@/lib/resume-doc";

interface Body {
  id?: number;
  resume?: { id?: number };
  doc?: { resumeId?: number };
  code?: string;
  error?: string;
  detail?: string;
  message?: string;
  plan?: string;
}

async function json(res: Response): Promise<Body | null> {
  try {
    return (await res.json()) as Body;
  } catch {
    return null;
  }
}

const SESSION = "Your session expired — please sign in again.";

/** `POST /api/resumes/:id/doc/duplicate`: a copy (new ids, "<name> (copy)") that counts against the plan's cap. */
export async function duplicateResume(id: number): Promise<CreateBuiltResult> {
  try {
    const res = await fetch(`/api/resumes/${id}/doc/duplicate`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const data = await json(res);
    if (res.status === 402) return { kind: "limit", plan: data?.plan, message: data?.detail ?? data?.error ?? "You've reached your resume limit." };
    if (res.status === 401) return { kind: "error", message: SESSION };
    if (res.status === 404) return { kind: "error", message: "That resume is no longer there." };
    const created = data?.resume?.id ?? data?.doc?.resumeId;
    if (!res.ok || typeof created !== "number") return { kind: "error", message: data?.error ?? "Couldn't duplicate the resume. Please try again." };
    return { kind: "ok", id: created };
  } catch {
    return { kind: "error", message: "Couldn't reach the server." };
  }
}

export type SimpleResult = { kind: "ok" } | { kind: "error"; message: string; code?: string };

/** `POST /api/resumes/:id/doc/import`: "Open in builder" on an uploaded resume. */
export async function importUploaded(id: number): Promise<SimpleResult> {
  try {
    const res = await fetch(`/api/resumes/${id}/doc/import`, { method: "POST" });
    if (res.ok) return { kind: "ok" };
    const data = await json(res);
    // Already built (another tab did it): nothing to do, the editor will open.
    if (res.status === 409 && data?.code === "ALREADY_BUILT") return { kind: "ok" };
    if (res.status === 401) return { kind: "error", message: SESSION };
    return { kind: "error", code: data?.code, message: data?.error ?? "Couldn't open this resume in the builder." };
  } catch {
    return { kind: "error", message: "Couldn't reach the server." };
  }
}

/** What the metadata PATCH accepts from the list. */
export type MetaPatch = { name: string } | { primary: true } | { archived: boolean };

/** `PATCH /api/resumes/:id/meta`. The API's `message` is shown as is (e.g. "make another one primary before archiving it"). */
export async function patchResumeMeta(id: number, patch: MetaPatch): Promise<SimpleResult> {
  try {
    const res = await fetch(`/api/resumes/${id}/meta`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    if (res.ok) return { kind: "ok" };
    const data = await json(res);
    if (res.status === 401) return { kind: "error", message: SESSION };
    if (res.status === 404) return { kind: "error", message: "That resume is no longer there." };
    return { kind: "error", code: data?.code, message: data?.message || data?.detail || data?.error || "Couldn't update the resume." };
  } catch {
    return { kind: "error", message: "Couldn't reach the server." };
  }
}

/** `DELETE /api/resumes/:id`. A resume used by a tracked application is refused (409) with the nudge to archive it. */
export async function deleteResume(id: number): Promise<SimpleResult> {
  try {
    const res = await fetch(`/api/resumes/${id}`, { method: "DELETE" });
    if (res.ok) return { kind: "ok" };
    const data = await json(res);
    if (res.status === 401) return { kind: "error", message: SESSION };
    return { kind: "error", code: res.status === 409 ? "IN_USE" : data?.code, message: data?.error ?? "Couldn't delete the resume." };
  } catch {
    return { kind: "error", message: "Couldn't reach the server." };
  }
}

/** `POST /api/resumes/:id/file`: keep the uploaded file with the resume made from it. */
export async function attachOriginal(id: number, file: File): Promise<SimpleResult> {
  try {
    const form = new FormData();
    form.append("file", file, file.name);
    const res = await fetch(`/api/resumes/${id}/file`, { method: "POST", body: form });
    if (res.ok) return { kind: "ok" };
    const data = await json(res);
    return { kind: "error", message: data?.error ?? "Couldn't attach the file." };
  } catch {
    return { kind: "error", message: "Couldn't reach the server." };
  }
}
