import { apiUrl } from "@/lib/config";
import { setAuthCookies } from "@/lib/auth";
import { DEMO_LOGINS } from "@/lib/demo";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

/**
 * POST /api/auth/demo { login } — open one of the public demo accounts.
 *
 * Calls the API's `/api/authenticate/demo` (no password) and then does exactly what
 * `/api/auth/login` does: put the access + refresh tokens in the httpOnly session cookies, so the
 * rest of the app cannot tell a demo session from a password one. The browser only sees
 * `{ ok, landing }`. `landing` comes from THIS table, never from the client.
 *
 * Personal accounts only (decision O4): no organization account opens here. Those sign in on their own tenant host
 * (`/api/auth/tenant-demo`).
 */
const LANDING: Record<string, string> = { demo: "/dashboard", "demo-admin": "/admin" };

export async function POST(request: Request) {
  const rl = rateLimit(request, "demo-login", 20, 5 * 60_000); // 20 / 5 min per client IP
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  let body: { login?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const login = typeof body.login === "string" ? body.login.trim().toLowerCase() : "";
  if (!(DEMO_LOGINS as readonly string[]).includes(login)) {
    return Response.json({ error: "Unknown demo account." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(apiUrl("/api/authenticate/demo"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ login }),
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "Couldn't reach the server. Please try again." }, { status: 502 });
  }

  if (res.status === 403) {
    return Response.json({ error: "The demo isn't available right now.", code: "DEMO_DISABLED" }, { status: 403 });
  }
  if (!res.ok) {
    return Response.json({ error: "Couldn't open the demo. Please try again." }, { status: 502 });
  }

  const data = (await res.json().catch(() => ({}))) as { accessToken?: string; refreshToken?: string };
  if (!data.accessToken) {
    return Response.json({ error: "Unexpected response from the server." }, { status: 502 });
  }

  await setAuthCookies(data.accessToken, data.refreshToken ?? null);
  return Response.json({ ok: true, landing: LANDING[login] });
}
