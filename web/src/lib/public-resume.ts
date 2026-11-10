/**
 * Server-side access to the public resume share routes (R3.11, DESIGN 8.7 / 9.9). Used by the public
 * `/r/[token]` page and its PDF route, and by nothing signed-in: these calls carry NO credentials (the
 * token in the URL is the whole credential), so a visitor who happens to be signed in to Kiwiply is
 * treated exactly like anyone else.
 *
 * The visitor's address is forwarded as `X-Forwarded-For` so the API's per-visitor rate limit sees them
 * and not this web container.
 */
import { apiUrl } from "@/lib/config";
import type { ResumeDocument, ResumeTheme } from "@kiwiply/ui";

/** A share token: 32 base62 characters. Anything else cannot be real, so it never reaches the API. */
export const SHARE_TOKEN = /^[0-9A-Za-z]{32}$/;

/** What `GET /api/public/resumes/{token}` returns: the page, and nothing else. */
export interface PublicResume {
  name: string;
  doc: ResumeDocument;
  templateId: string;
  theme: Partial<ResumeTheme> | null;
  allowDownload: boolean;
  /** The stored PDF is current. Download is offered only when `allowDownload && pdfReady`. */
  pdfReady: boolean;
}

export type PublicResumeResult =
  | { kind: "ok"; resume: PublicResume }
  | { kind: "missing" }
  | { kind: "limited"; retryAfter: number }
  | { kind: "error" };

function forwardedFor(ip: string): Record<string, string> {
  return ip && ip !== "unknown" ? { "x-forwarded-for": ip } : {};
}

/** Open a share link. 404 (unknown, revoked, expired, switched off) is `missing`; 429 is `limited`. */
export async function fetchPublicResume(token: string, ip: string): Promise<PublicResumeResult> {
  if (!SHARE_TOKEN.test(token)) return { kind: "missing" };
  let res: Response;
  try {
    res = await fetch(apiUrl(`/api/public/resumes/${token}`), { headers: forwardedFor(ip), cache: "no-store" });
  } catch {
    return { kind: "error" };
  }
  if (res.status === 404) return { kind: "missing" };
  if (res.status === 429) return { kind: "limited", retryAfter: Number(res.headers.get("retry-after")) || 60 };
  if (!res.ok) return { kind: "error" };
  const body = (await res.json().catch(() => null)) as Partial<PublicResume> | null;
  if (!body || typeof body.doc !== "object" || body.doc === null || typeof body.templateId !== "string") return { kind: "error" };
  return {
    kind: "ok",
    resume: {
      name: typeof body.name === "string" ? body.name : "",
      doc: body.doc,
      templateId: body.templateId,
      theme: body.theme ?? null,
      allowDownload: body.allowDownload === true,
      pdfReady: body.pdfReady === true,
    },
  };
}

/** The raw API answer for the PDF behind a link (the route handler maps it). */
export async function fetchPublicPdf(token: string, ip: string): Promise<Response | null> {
  if (!SHARE_TOKEN.test(token)) return null;
  try {
    return await fetch(apiUrl(`/api/public/resumes/${token}/pdf`), { headers: forwardedFor(ip), cache: "no-store" });
  } catch {
    return null;
  }
}
