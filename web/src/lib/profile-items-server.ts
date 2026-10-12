/**
 * Server-side readers for the `/profiles` page (Server Components only: they read the session cookie
 * through `serverApiFetch`). Never throw: null means "could not load", and the page says so. The
 * browser-side fetchers and types live in `profile-items.ts` (which must stay importable by client code).
 */
import { serverApiFetch } from "@/lib/api";
import type { Completeness, ProfileItem } from "@/lib/profile-items";

export async function getProfileItems(): Promise<ProfileItem[] | null> {
  try {
    const res = await serverApiFetch("/api/profile/items");
    if (!res.ok) return null;
    const body: unknown = await res.json();
    return Array.isArray(body) ? (body as ProfileItem[]) : null;
  } catch {
    return null;
  }
}

/** `bio.meta_json.provenance` (`key -> parsed | user | learned`): the source chips on the profile fields. `{}` when unknown. */
export async function getBioProvenance(): Promise<Record<string, string>> {
  try {
    const res = await serverApiFetch("/api/profile/provenance");
    if (!res.ok) return {};
    const body: unknown = await res.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return {};
    return Object.fromEntries(Object.entries(body).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  } catch {
    return {};
  }
}

export async function getCompleteness(): Promise<Completeness | null> {
  try {
    const res = await serverApiFetch("/api/profile/completeness");
    if (!res.ok) return null;
    const body: unknown = await res.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Completeness) : null;
  } catch {
    return null;
  }
}
