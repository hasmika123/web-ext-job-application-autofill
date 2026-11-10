import { apiUrl } from "@/lib/config";
import { authHostHeaders } from "@/lib/auth-host";
import { getRefreshToken, setAuthCookies } from "@/lib/auth";
import { serverApiFetch } from "@/lib/api";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

/**
 * POST /api/auth/change-password `{ currentPassword, newPassword }` - the forced first-sign-in change (and any later change) for the
 * signed-in session. Spring checks the current password and the password rules and clears the must-change flag; then ONE refresh
 * swaps the session cookies for a pair without the flag, so the person can go straight to their workspace. The passwords are only
 * forwarded: never logged, never echoed back.
 */
export async function POST(request: Request) {
  const rl = rateLimit(request, "change-password", 10, 5 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  let body: { currentPassword?: unknown; newPassword?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (!currentPassword || !newPassword) return Response.json({ error: "Enter your current password and a new one." }, { status: 400 });

  let res: Response;
  try {
    res = await serverApiFetch("/api/account/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  if (res.status === 401) return Response.json({ error: "Your session expired. Sign in again.", code: "SESSION_EXPIRED" }, { status: 401 });
  if (res.status === 400) return Response.json({ error: "The current password is not right, or the new password is not allowed. Choose a different one.", code: "INVALID_PASSWORD" }, { status: 400 });
  if (!res.ok) return Response.json({ error: "The password could not be changed." }, { status: res.status >= 500 ? 502 : res.status });

  // The access token we hold still carries the must-change claim: trade the refresh token for a clean pair.
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    try {
      const r = await fetch(apiUrl("/api/refresh"), {
        method: "POST",
        headers: { "content-type": "application/json", ...(await authHostHeaders()) },
        body: JSON.stringify({ refreshToken }),
        cache: "no-store",
      });
      if (r.ok) {
        const data = (await r.json()) as { accessToken?: string; refreshToken?: string };
        if (data.accessToken) await setAuthCookies(data.accessToken, data.refreshToken ?? refreshToken);
      }
    } catch {
      /* the password is changed; the proxy refreshes the session on the next request */
    }
  }
  return Response.json({ ok: true });
}
