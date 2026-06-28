import { apiUrl } from "@/lib/config";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

/**
 * POST /api/auth/reset-password — proxy the Spring reset-password/finish endpoint.
 *
 * Takes the key from the emailed link plus the new password. The backend returns a
 * non-2xx when the key is missing/expired or the password is too short; we map that to a
 * friendly message. On success the user signs in normally with their new password.
 */
const MIN_LEN = 4; // matches the backend (ManagedUserVM.PASSWORD_MIN_LENGTH)

export async function POST(request: Request) {
  const rl = rateLimit(request, "reset", 10, 60 * 60_000); // 10 / hour per client IP
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  let body: { key?: string; newPassword?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const key = body.key?.trim();
  const newPassword = body.newPassword;
  if (!key) {
    return Response.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }
  if (!newPassword || newPassword.length < MIN_LEN) {
    return Response.json({ error: `Password must be at least ${MIN_LEN} characters.` }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(apiUrl("/api/account/reset-password/finish"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, newPassword }),
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "Couldn't reach the server. Please try again." }, { status: 502 });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const error = /password/i.test(detail)
      ? "That password isn't allowed (4–100 characters)."
      : "This reset link is invalid or has expired. Request a new one.";
    return Response.json({ error }, { status: 400 });
  }

  return Response.json({ ok: true });
}
