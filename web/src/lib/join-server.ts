import { headers } from "next/headers";
import { serverApiFetch } from "@/lib/api";
import type { JoinLink, JoinPreview } from "@/lib/org-join";

/** What a join link turned out to be. `missing` is the one answer for anything that is not a live link. */
export type JoinLookup =
  | { state: "ok"; preview: JoinPreview }
  | { state: "expired"; reason: "expired" | "full"; orgName: string | null }
  | { state: "missing" }
  | { state: "busy" }
  | { state: "error" };

/**
 * Looks up the public preview of a join link on the server (the page renders from it, so the link is never exposed to a
 * client fetch before the person has anything to look at). Forwards the visitor's address so Spring rate limits the person,
 * not the web server. A slug in the URL that does not belong to the link's org is treated as a missing link: a stranger
 * cannot tell a wrong slug from a wrong code.
 */
export async function loadJoinPreview(link: JoinLink): Promise<JoinLookup> {
  const path = link.kind === "token" ? `/api/join/${encodeURIComponent(link.token)}` : `/api/join/code/${encodeURIComponent(link.code)}`;
  const h = await headers();
  const forwarded = new Headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (ip) forwarded.set("x-forwarded-for", ip);
  let res: Response;
  try {
    res = await serverApiFetch(path, { headers: forwarded });
  } catch {
    return { state: "error" };
  }
  if (res.status === 404) return { state: "missing" };
  if (res.status === 429) return { state: "busy" };
  if (res.status === 409) {
    const p = (await res.json().catch(() => null)) as { code?: string; reason?: string; orgName?: string } | null;
    if (p?.code === "INVITE_EXPIRED") return { state: "expired", reason: p.reason === "full" ? "full" : "expired", orgName: p.orgName ?? null };
    return { state: "error" };
  }
  if (!res.ok) return { state: "error" };
  const preview = (await res.json().catch(() => null)) as JoinPreview | null;
  if (!preview?.orgName || !preview.consent) return { state: "error" };
  if (link.kind === "code" && preview.orgSlug.toLowerCase() !== link.slug.toLowerCase()) return { state: "missing" };
  return { state: "ok", preview };
}
