import { serverApiFetch } from "@/lib/api";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

/**
 * POST /api/bug-reports — public bug-report submit, proxied to Spring. Rate-limited per client IP
 * (this BFF sees the real IP). serverApiFetch forwards the user's bearer when signed in, so Spring
 * can attribute the report; anonymous is allowed too. Diagnostic fields (url/userAgent) are only
 * present when the reporter consented — we forward whatever the widget sent, nothing more.
 */
export async function POST(request: Request) {
  const rl = rateLimit(request, "bug-report", 10, 60 * 60_000); // 10 / hour per IP
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  let body: { message?: string; category?: string; email?: string; url?: string; userAgent?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const message = body.message?.trim();
  if (!message) {
    return Response.json({ error: "Please describe the issue." }, { status: 400 });
  }

  const forward = {
    source: "web",
    message,
    category: body.category,
    email: body.email,
    url: body.url,
    userAgent: body.userAgent,
  };

  let res: Response;
  try {
    res = await serverApiFetch("/api/bug-reports", { method: "POST", body: JSON.stringify(forward) });
  } catch {
    return Response.json({ error: "Couldn't reach the server. Please try again." }, { status: 502 });
  }
  if (res.status === 400) {
    return Response.json({ error: "Please describe the issue." }, { status: 400 });
  }
  return Response.json({ ok: true });
}
