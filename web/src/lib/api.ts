/**
 * Server-side fetch to the Spring API with the user's bearer token attached.
 *
 * Used by Server Components and Route Handlers. The access token is read from the
 * httpOnly cookie and sent as `Authorization: Bearer`. This never runs in the browser,
 * so the token stays server-side.
 *
 * Note: this does not transparently refresh on 401 — Server Components can't write
 * cookies. Callers treat 401 as "session expired" (redirect to /login) or hit
 * /api/auth/refresh from the client. Transparent refresh can move into proxy.ts later.
 */
import { apiUrl } from "@/lib/config";
import { headers as requestHeaders } from "next/headers";
import { getAccessToken } from "@/lib/auth";
import { clientIpFromHeaders } from "@/lib/rate-limit";
import { TENANT_HOST_HEADER, tenantApiHeaders } from "@/lib/tenant-host";

export async function serverApiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) headers.set("content-type", "application/json");
  // X1.4: the API resolves the tenant from the host the visitor arrived on (set by proxy.ts), never from a parameter.
  try {
    const incoming = await requestHeaders();
    // Act-for (a marketer editing a consultant's resume in the one builder): the editor's calls carry the directory row they act on; the API gate decides.
    const actFor = incoming.get("x-kiwiply-act-for");
    if (actFor && !headers.has("x-kiwiply-act-for") && /^\d{1,18}$/.test(actFor)) headers.set("X-Kiwiply-Act-For", actFor);
    const host = incoming.get(TENANT_HOST_HEADER);
    if (host) {
      // the shared secret proves to the API that this is the web server; the visitor's address keeps its per-visitor limits honest
      for (const [name, value] of Object.entries(tenantApiHeaders(host, clientIpFromHeaders(incoming)))) headers.set(name, value);
    }
  } catch {
    // not inside a request (build time, a script): nothing to forward
  }
  return fetch(apiUrl(path), { ...init, headers, cache: "no-store" });
}
