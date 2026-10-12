/**
 * Server-side read of the API's public switches (`GET /api/config/public`, E2E-O1.9): is the organization area on,
 * is the demo on. The answer is the same for every visitor, so it is cached for five minutes like the API says.
 */
import { apiUrl } from "@/lib/config";

export interface PublicConfig {
  /** Organization features are on (the API's org feature flag). */
  orgs: boolean;
  /** The public demo accounts are on. */
  demo: boolean;
}

/** What a missing, slow or malformed answer means: everything dark. The flag fails closed. */
export const PUBLIC_CONFIG_OFF: PublicConfig = { orgs: false, demo: false };

/** Never throws: an API that is down or older than the endpoint reads as "orgs off". */
export async function getPublicConfig(): Promise<PublicConfig> {
  try {
    const res = await fetch(apiUrl("/api/config/public"), {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return PUBLIC_CONFIG_OFF;
    const data = (await res.json().catch(() => null)) as Partial<PublicConfig> | null;
    if (!data) return PUBLIC_CONFIG_OFF;
    return { orgs: data.orgs === true, demo: data.demo === true };
  } catch {
    return PUBLIC_CONFIG_OFF;
  }
}
