/**
 * The subprocessor register (T1.5), public side: who processes personal data on our behalf, why, which data, where, with a link to their terms. The list is admin-configured on
 * the API (settings `legal.subprocessor.01..12`); this reads `GET /api/public/legal/subprocessors` (public, no token, cached five minutes like the other public reads). The DPA
 * status the admin tracks is not part of it.
 */
import { apiUrl } from "@/lib/config";

export interface Subprocessor {
  name: string;
  purpose: string;
  data: string;
  location: string;
  link: string;
}

/** Keeps only well-formed entries with an https link (the page renders `link` as an anchor, so anything else is dropped to plain text). */
export function normalizeSubprocessors(raw: unknown): Subprocessor[] {
  const items = raw && typeof raw === "object" ? (raw as { items?: unknown }).items : null;
  if (!Array.isArray(items)) return [];
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const out: Subprocessor[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const name = str(o.name);
    if (!name) continue;
    const link = str(o.link);
    out.push({ name, purpose: str(o.purpose), data: str(o.data), location: str(o.location), link: /^https:\/\//i.test(link) ? link : "" });
  }
  return out;
}

/** The register, or null when the API cannot be reached (the page then says so rather than showing an empty list as if it were true). Never throws. */
export async function getSubprocessors(): Promise<Subprocessor[] | null> {
  try {
    const res = await fetch(apiUrl("/api/public/legal/subprocessors"), { next: { revalidate: 300 }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    return normalizeSubprocessors(await res.json().catch(() => null));
  } catch {
    return null;
  }
}
