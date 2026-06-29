import { apiUrl } from "@/lib/config";
import { setAuthCookies } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

/**
 * POST /api/auth/login/mfa — second step of admin MFA sign-in (Phase 9.X.3). Exchanges the
 * mfaToken + emailed code (via Spring /api/authenticate/mfa) for tokens and sets the httpOnly
 * cookies. Rate-limited to blunt code guessing (the server also locks after a few wrong tries).
 */
export async function POST(request: Request) {
  const rl = rateLimit(request, "login-mfa", 10, 5 * 60_000); // 10 / 5 min per client IP
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  let body: { mfaToken?: string; code?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const mfaToken = body.mfaToken?.trim();
  const code = body.code?.trim();
  if (!mfaToken || !code) {
    return Response.json({ error: "Enter the code we emailed you." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(apiUrl("/api/authenticate/mfa"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mfaToken, code }),
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "Couldn't reach the server. Please try again." }, { status: 502 });
  }

  if (!res.ok) {
    return Response.json({ error: "That code is incorrect or expired." }, { status: 401 });
  }

  const data = (await res.json()) as { accessToken?: string; refreshToken?: string };
  if (!data.accessToken) {
    return Response.json({ error: "Unexpected response from the server." }, { status: 502 });
  }
  await setAuthCookies(data.accessToken, data.refreshToken ?? null);
  return Response.json({ ok: true });
}
