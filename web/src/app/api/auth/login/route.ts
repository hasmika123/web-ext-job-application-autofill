import { apiUrl } from "@/lib/config";
import { setAuthCookies } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

/**
 * POST /api/auth/login — proxy the Spring authenticate endpoint and stash the JWT
 * in httpOnly cookies. The browser only ever sees `{ ok: true }`, never the token.
 */
export async function POST(request: Request) {
  const rl = rateLimit(request, "login", 10, 5 * 60_000); // 10 / 5 min per client IP
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const username = body.username?.trim();
  const password = body.password;
  if (!username || !password) {
    return Response.json({ error: "Enter your username and password." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(apiUrl("/api/authenticate"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "Couldn't reach the server. Is the API running?" }, { status: 502 });
  }

  if (!res.ok) {
    return Response.json({ error: "Incorrect username or password." }, { status: 401 });
  }

  const data = (await res.json()) as { accessToken?: string; refreshToken?: string; mfaRequired?: boolean; mfaToken?: string };

  // Admin MFA (Phase 9.X.3): the server withheld tokens and emailed a code. Pass the handle to the
  // client for the second step; do NOT set cookies yet.
  if (data.mfaRequired && data.mfaToken) {
    return Response.json({ mfaRequired: true, mfaToken: data.mfaToken });
  }

  if (!data.accessToken) {
    return Response.json({ error: "Unexpected response from the server." }, { status: 502 });
  }

  await setAuthCookies(data.accessToken, data.refreshToken ?? null);
  return Response.json({ ok: true });
}
