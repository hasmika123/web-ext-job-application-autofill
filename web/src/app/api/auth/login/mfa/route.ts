import { apiUrl } from "@/lib/config";
import { authHostHeaders, isNotAMember, NOT_A_MEMBER_MESSAGE } from "@/lib/auth-host";
import { setAuthCookies, setDeviceCookie } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { passwordChangeRequired } from "@/lib/jwt-claims";

/**
 * POST /api/auth/login/mfa — second step of admin MFA sign-in (Phase 9.X.3). Exchanges the
 * mfaToken + emailed code (via Spring /api/authenticate/mfa) for tokens and sets the httpOnly
 * cookies. Rate-limited to blunt code guessing (the server also locks after a few wrong tries).
 */
export async function POST(request: Request) {
  const rl = rateLimit(request, "login-mfa", 10, 5 * 60_000); // 10 / 5 min per client IP
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  let body: { mfaToken?: string; code?: string; remember?: boolean };
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
      headers: { "content-type": "application/json", ...(await authHostHeaders()) },
      // gap D-2: on an organization that requires two-step sign-in, "remember this browser"
      body: JSON.stringify({ mfaToken, code, rememberDevice: body.remember === true }),
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "Couldn't reach the server. Please try again." }, { status: 502 });
  }

  if (await isNotAMember(res)) {
    return Response.json({ error: NOT_A_MEMBER_MESSAGE, code: "NOT_A_MEMBER" }, { status: 403 });
  }
  if (res.status === 403 && ((await res.clone().json().catch(() => ({}))) as { code?: string }).code === "TEMP_PASSWORD_EXPIRED") {
    return Response.json({ error: "Your temporary password has expired. Ask your administrator for a new one.", code: "TEMP_PASSWORD_EXPIRED" }, { status: 403 });
  }
  if (!res.ok) {
    return Response.json({ error: "That code is incorrect or expired." }, { status: 401 });
  }

  const data = (await res.json()) as { accessToken?: string; refreshToken?: string; deviceToken?: string; deviceExpiresAt?: string };
  if (!data.accessToken) {
    return Response.json({ error: "Unexpected response from the server." }, { status: 502 });
  }
  // A temporary password still has to be changed first: the code step never skips that (it used to).
  if (passwordChangeRequired(data.accessToken) && Object.keys(await authHostHeaders()).length === 0) {
    return Response.json({ error: "Sign in at your organization address to choose your own password first.", code: "USE_ORG_ADDRESS" }, { status: 403 });
  }
  await setAuthCookies(data.accessToken, data.refreshToken ?? null);
  if (data.deviceToken) await setDeviceCookie(data.deviceToken, data.deviceExpiresAt);
  return Response.json(passwordChangeRequired(data.accessToken) ? { ok: true, passwordChangeRequired: true } : { ok: true });
}
