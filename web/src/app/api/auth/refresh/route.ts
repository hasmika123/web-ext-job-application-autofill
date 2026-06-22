import { apiUrl } from "@/lib/config";
import { getRefreshToken, setAuthCookies } from "@/lib/auth";

/**
 * POST /api/auth/refresh — exchange the stored refresh token for a fresh access token
 * (Spring POST /api/refresh) and update the access cookie. Returns 401 if there's no
 * valid refresh token, so the client knows to send the user back to /login.
 */
export async function POST() {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    return Response.json({ error: "No session." }, { status: 401 });
  }

  let res: Response;
  try {
    res = await fetch(apiUrl("/api/refresh"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }

  if (!res.ok) {
    return Response.json({ error: "Session expired." }, { status: 401 });
  }

  const data = (await res.json()) as { accessToken?: string; refreshToken?: string };
  if (!data.accessToken) {
    return Response.json({ error: "Unexpected response from the server." }, { status: 502 });
  }

  // The server ROTATES the refresh token on every refresh, so store the new one when
  // present (the old one is now revoked); fall back to the existing one defensively.
  await setAuthCookies(data.accessToken, data.refreshToken ?? refreshToken);
  return Response.json({ ok: true });
}
