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
import { getAccessToken } from "@/lib/auth";

export async function serverApiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return fetch(apiUrl(path), { ...init, headers, cache: "no-store" });
}
