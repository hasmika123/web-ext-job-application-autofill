import { apiUrl } from "@/lib/config";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

/**
 * POST /api/auth/signup — proxy the Spring (JHipster) register endpoint.
 *
 * On success the backend creates an inactive account and emails an activation link;
 * the user can't sign in until they activate. We surface that as `needsActivation`
 * rather than logging them straight in. (A dev-only auto-activate path can be added
 * later so local self-signup works without a mail server.)
 */
export async function POST(request: Request) {
  const rl = rateLimit(request, "signup", 5, 60 * 60_000); // 5 / hour per client IP
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  let body: { username?: string; email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const login = body.username?.trim();
  const email = body.email?.trim();
  const password = body.password;
  if (!login || !email || !password) {
    return Response.json({ error: "Enter a username, email, and password." }, { status: 400 });
  }
  if (password.length < 4) {
    return Response.json({ error: "Password must be at least 4 characters." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(apiUrl("/api/register"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ login, email, password, langKey: "en" }),
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "Couldn't reach the server. Is the API running?" }, { status: 502 });
  }

  if (res.status === 201) {
    return Response.json({ ok: true, needsActivation: true });
  }

  // JHipster returns 400 for login/email-already-used and invalid-password.
  const detail = await res.text().catch(() => "");
  let error = "Couldn't create the account.";
  if (/login.*already/i.test(detail)) error = "That username is already taken.";
  else if (/email.*already/i.test(detail)) error = "That email is already in use.";
  else if (/password/i.test(detail)) error = "That password isn't allowed (4–100 characters).";
  return Response.json({ error }, { status: res.status === 400 ? 400 : 502 });
}
