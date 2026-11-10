import { apiUrl } from "@/lib/config";
import { authHostHeaders, isNotAMember, NOT_A_MEMBER_MESSAGE } from "@/lib/auth-host";
import { setAuthCookies } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

/**
 * POST /api/auth/tenant-demo { login } (X1.12) - the one-click sign-in of an enterprise demo member, on that member's tenant host.
 *
 * Calls the API's `/api/authenticate/demo` WITH the tenant host (so the API binds the session to that tenant and refuses a
 * member of another one), then does what `/api/auth/login` does: httpOnly cookies, `{ ok }` to the browser. The landing is
 * the tenant root, which sends a member to the landing the API names (`/api/me/tenant.landing`). A platform host is refused
 * here without calling the API: the personal demo accounts have their own route (`/api/auth/demo`).
 */
export async function POST(request: Request) {
  const rl = rateLimit(request, "tenant-demo-login", 20, 5 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const hostHeaders = await authHostHeaders();
  if (!hostHeaders["X-Kiwiply-Host"]) return Response.json({ error: "Unknown demo account." }, { status: 404 });

  let body: { login?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const login = typeof body.login === "string" ? body.login.trim().toLowerCase() : "";
  if (!/^demo-ent-[a-z0-9-]{1,60}$/.test(login)) return Response.json({ error: "Unknown demo account." }, { status: 400 });

  let res: Response;
  try {
    res = await fetch(apiUrl("/api/authenticate/demo"), {
      method: "POST",
      headers: { "content-type": "application/json", ...hostHeaders },
      body: JSON.stringify({ login }),
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "Couldn't reach the server. Please try again." }, { status: 502 });
  }

  if (await isNotAMember(res)) return Response.json({ error: NOT_A_MEMBER_MESSAGE, code: "NOT_A_MEMBER" }, { status: 403 });
  if (res.status === 403) return Response.json({ error: "The demo isn't available right now.", code: "DEMO_DISABLED" }, { status: 403 });
  if (res.status === 404) return Response.json({ error: "Unknown demo account." }, { status: 404 });
  if (!res.ok) return Response.json({ error: "Couldn't open the demo. Please try again." }, { status: 502 });

  const data = (await res.json().catch(() => ({}))) as { accessToken?: string; refreshToken?: string };
  if (!data.accessToken) return Response.json({ error: "Unexpected response from the server." }, { status: 502 });

  await setAuthCookies(data.accessToken, data.refreshToken ?? null);
  return Response.json({ ok: true, landing: "/" });
}
