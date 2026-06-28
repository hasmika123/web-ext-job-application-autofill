import { apiUrl } from "@/lib/config";
import { setAuthCookies } from "@/lib/auth";

/**
 * POST /api/auth/google — exchange a Google ID token (the credential from Google
 * Identity Services in the browser) for our httpOnly session cookies.
 *
 * Mirrors the password-login route: the browser never sees our JWT. The Spring API
 * verifies the Google token (signature + audience == our client id) and find-or-creates
 * the user by verified email, returning our access + refresh tokens, which we stash in
 * cookies here. 503 if Google sign-in isn't configured on the API.
 */
export async function POST(request: Request) {
  let body: { credential?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const credential = body.credential;
  if (!credential) {
    return Response.json({ error: "Missing Google credential." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(apiUrl("/api/auth/google"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ credential }),
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "Couldn't reach the server. Is the API running?" }, { status: 502 });
  }

  if (res.status === 503) {
    return Response.json({ error: "Google sign-in isn't enabled yet." }, { status: 503 });
  }
  if (!res.ok) {
    return Response.json({ error: "Google sign-in failed. Please try again." }, { status: 401 });
  }

  const data = (await res.json()) as { accessToken?: string; refreshToken?: string };
  if (!data.accessToken) {
    return Response.json({ error: "Unexpected response from the server." }, { status: 502 });
  }

  await setAuthCookies(data.accessToken, data.refreshToken ?? null);
  return Response.json({ ok: true });
}
