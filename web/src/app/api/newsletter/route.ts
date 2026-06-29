import { apiUrl } from "@/lib/config";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

/**
 * POST /api/newsletter — public newsletter subscribe (double opt-in), proxied to Spring.
 * Rate-limited per client IP (this BFF is the only layer that sees the real IP). The backend
 * is generic (never reveals whether the address already existed), so we mirror that with a
 * generic { ok: true } — except a malformed email, which we surface as 400 for the form.
 */
export async function POST(request: Request) {
  const rl = rateLimit(request, "newsletter", 10, 60 * 60_000); // 10 / hour per IP
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  let body: { email?: string; source?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const email = body.email?.trim();
  if (!email) {
    return Response.json({ error: "Enter your email address." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(apiUrl("/api/newsletter/subscribe"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, source: body.source ?? "footer" }),
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "Couldn't reach the server. Please try again." }, { status: 502 });
  }

  if (res.status === 400) {
    return Response.json({ error: "Please enter a valid email." }, { status: 400 });
  }
  // 202 (accepted) or anything else non-fatal → generic success (no enumeration).
  return Response.json({ ok: true });
}
