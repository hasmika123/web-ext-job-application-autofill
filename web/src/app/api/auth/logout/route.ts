import { apiUrl } from "@/lib/config";
import { clearAuthCookies, getRefreshToken } from "@/lib/auth";

/**
 * POST /api/auth/logout — revoke the refresh token server-side (so it can't be replayed),
 * then clear the session cookies. Revocation is best-effort; the cookies are cleared
 * regardless.
 */
export async function POST() {
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    try {
      await fetch(apiUrl("/api/logout"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken }),
        cache: "no-store",
      });
    } catch {
      // best-effort — still clear the cookies below
    }
  }
  await clearAuthCookies();
  return Response.json({ ok: true });
}
