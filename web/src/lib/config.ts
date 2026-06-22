/**
 * Server-side configuration for the Dossier web app.
 *
 * The browser never talks to the Spring API directly — Next route handlers proxy
 * auth and data calls so the JWT can live in httpOnly cookies (set in 1.10c). That's
 * why the API base URL is a plain server env var (no NEXT_PUBLIC_ prefix); it must
 * never be exposed to the client bundle.
 */

/** Base URL of the Dossier Spring API, e.g. http://localhost:8080. No trailing slash. */
export function apiBaseUrl(): string {
  const raw = process.env.DOSSIER_API_URL ?? "http://localhost:8080";
  return raw.replace(/\/+$/, "");
}

/** Build an absolute API URL from a leading-slash path, e.g. apiUrl("/api/authenticate"). */
export function apiUrl(path: string): string {
  return apiBaseUrl() + (path.startsWith("/") ? path : `/${path}`);
}
