/**
 * Client-side shapes and calls for resume sharing (R3.11, DESIGN 9.7 / 9.9): what the browser sends to the
 * `/api/resumes/**` BFF routes. Spring owns every rule (limits, expiry, ownership); this file only types the
 * answers and turns the refusals into a short message a person can read.
 */

/** A resume someone shared with me. `via`: a person's grant (USER) or my organisation's marketer pairing (ORG). */
export interface SharedResume {
  resumeId: number;
  name: string;
  owner: string;
  role: string;
  via: "USER" | "ORG";
}

export type SharedResumesResult = { kind: "ok"; items: SharedResume[] } | { kind: "error"; message: string };

/** `GET /api/resumes/shared-with-me`. Never throws. */
export async function loadSharedWithMe(): Promise<SharedResumesResult> {
  try {
    const res = await fetch("/api/resumes/shared-with-me", { cache: "no-store" });
    if (!res.ok) return { kind: "error", message: "Couldn't load the resumes shared with you." };
    const body = (await res.json().catch(() => null)) as unknown;
    return { kind: "ok", items: Array.isArray(body) ? (body as SharedResume[]) : [] };
  } catch {
    return { kind: "error", message: "Couldn't reach the server." };
  }
}

export type SharedPdfResult = { kind: "ok"; blob: Blob } | { kind: "notReady" } | { kind: "error"; message: string };

/** `GET /api/resumes/shared/:id/export?format=pdf`. 409 `PDF_NOT_READY` is `notReady`; never throws. */
export async function loadSharedPdf(resumeId: number): Promise<SharedPdfResult> {
  try {
    const res = await fetch(`/api/resumes/shared/${resumeId}/export?format=pdf`, { cache: "no-store" });
    if (res.status === 409) return { kind: "notReady" };
    if (!res.ok) return { kind: "error", message: "Couldn't download the PDF." };
    return { kind: "ok", blob: await res.blob() };
  } catch {
    return { kind: "error", message: "Couldn't reach the server." };
  }
}
