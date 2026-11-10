/**
 * Server-side demo helpers (phase demo): the public "is the demo on?" fetch and the read-only
 * pass-through for BFF routes.
 */
import { apiUrl } from "@/lib/config";
import { DEMO_READ_ONLY_HEADER, DEMO_READ_ONLY_MESSAGE, type DemoInfo } from "@/lib/demo";

/**
 * Ask the API whether the demo is on, and which accounts it offers. Public (no token). Returns
 * `null` on ANY failure (API down, older API without the endpoint, bad body): the callers hide the
 * demo UI then, so a missing API leaves the login page exactly as it was.
 */
export async function getDemoInfo(): Promise<DemoInfo | null> {
  try {
    const res = await fetch(apiUrl("/api/public/demo"), {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as Partial<DemoInfo> | null;
    if (!data || typeof data.enabled !== "boolean" || !Array.isArray(data.accounts)) return null;
    const t = data.tenantDemo;
    const tenantDemo = t && typeof t.host === "string" && typeof t.name === "string" ? { host: t.host, name: t.name } : null;
    return { enabled: data.enabled, accounts: data.accounts, tenantDemo };
  } catch {
    return null;
  }
}

/**
 * If the API refused a write because the caller is a demo account (403 `DEMO_READ_ONLY`), return the
 * response the browser should get instead: the same 403 with a plain message, a `code` the UI can
 * branch on, and a header the in-app toaster watches for. Otherwise `null`, and the route carries on
 * with its normal handling. Reads from a clone, so the original body is still readable.
 */
export async function demoReadOnly(res: Response): Promise<Response | null> {
  if (res.status !== 403) return null;
  const problem = (await res.clone().json().catch(() => null)) as { code?: string } | null;
  if (problem?.code !== "DEMO_READ_ONLY") return null;
  return Response.json(
    { error: DEMO_READ_ONLY_MESSAGE, message: DEMO_READ_ONLY_MESSAGE, code: "DEMO_READ_ONLY" },
    { status: 403, headers: { [DEMO_READ_ONLY_HEADER]: "1" } },
  );
}
