import { apiUrl } from "@/lib/config";
import { setAuthCookies } from "@/lib/auth";

/**
 * POST /api/auth/login — proxy the Spring authenticate endpoint and stash the JWT
 * in httpOnly cookies. The browser only ever sees `{ ok: true }`, never the token.
 */
export async function POST(request: Request) {
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

  const data = (await res.json()) as { accessToken?: string; refreshToken?: string };
  if (!data.accessToken) {
    return Response.json({ error: "Unexpected response from the server." }, { status: 502 });
  }

  await setAuthCookies(data.accessToken, data.refreshToken ?? null);
  return Response.json({ ok: true });
}
