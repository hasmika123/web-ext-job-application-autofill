import { redirect } from "next/navigation";

type Query = Record<string, string | string[] | undefined>;

/**
 * Old (app v2) routes redirect to their app v3 home (APP-V3-SPEC section 0) so links from the
 * extension, emails and notifications keep resolving. `keep` lists the query params that still mean
 * something on the new page (`?job=`, `?q=`, ...); everything else is dropped.
 */
export function redirectLegacy(to: string, query: Query = {}, keep: string[] = []): never {
  const qs = new URLSearchParams();
  for (const k of keep) {
    const v = query[k];
    const one = Array.isArray(v) ? v[0] : v;
    if (one) qs.set(k, one.slice(0, 200));
  }
  const s = qs.toString();
  redirect(s ? `${to}?${s}` : to);
}
