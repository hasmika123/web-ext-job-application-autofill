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

  const data = (await res.json()) as { accessToken?: string };
  if (!data.accessToken) {
    return Response.json({ error: "Unexpected response from the server." }, { status: 502 });
  }

  // Keep the existing refresh token; only the access token rotates.
  await setAuthCookies(data.accessToken, refreshToken);
  return Response.json({ ok: true });
}
