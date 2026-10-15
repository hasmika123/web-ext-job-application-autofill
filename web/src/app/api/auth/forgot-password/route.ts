import { apiUrl } from "@/lib/config";
import { authHostHeaders } from "@/lib/auth-host";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

/**
 * POST /api/auth/forgot-password — proxy the Spring reset-password/init endpoint.
 *
 * The backend always responds 200 whether or not the email exists (it won't reveal which
 * addresses are registered), and emails a reset link when there's a match. We mirror that:
 * we always return `{ ok: true }` so the UI can show the same "check your email" message
 * either way. The Spring endpoint binds the raw email as a plain-text request body.
 *
 * S9 (decision O4): on an organization's host the request carries that host, so the API looks the address up among THAT organization's
 * accounts only and builds the link on that host; on kiwiply.com it is the personal account only. The answer is the same either way.
 */
export async function POST(request: Request) {
  const rl = rateLimit(request, "forgot", 5, 60 * 60_000); // 5 / hour per client IP
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = body.email?.trim();
  if (!email) {
    return Response.json({ error: "Enter your email address." }, { status: 400 });
  }

  try {
    await fetch(apiUrl("/api/account/reset-password/init"), {
      method: "POST",
      headers: { "content-type": "text/plain", ...(await authHostHeaders()) },
      body: email,
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "Couldn't reach the server. Please try again." }, { status: 502 });
  }

  // Always success — never disclose whether the address is registered.
  return Response.json({ ok: true });
}
