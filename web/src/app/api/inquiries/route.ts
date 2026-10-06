import { serverApiFetch } from "@/lib/api";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

/**
 * POST /api/inquiries — public "Contact us" submit (Phase 15.6), proxied to Spring. Rate-limited per
 * client IP (this BFF sees the real IP). serverApiFetch forwards the bearer when signed in, so
 * Spring can attribute the request; anonymous is the normal case.
 */
export async function POST(request: Request) {
  const rl = rateLimit(request, "inquiry", 5, 60 * 60_000); // 5 / hour per IP
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  let body: { topic?: unknown; name?: unknown; email?: unknown; company?: unknown; teamSize?: unknown; message?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const forward = {
    topic: str(body.topic),
    name: str(body.name),
    email: str(body.email),
    company: str(body.company),
    teamSize: str(body.teamSize),
    message: str(body.message),
  };
  if (!forward.name || !forward.email) {
    return Response.json({ error: "Please add your name and email." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await serverApiFetch("/api/inquiries", { method: "POST", body: JSON.stringify(forward) });
  } catch {
    return Response.json({ error: "Couldn't reach the server. Please try again." }, { status: 502 });
  }
  if (res.status === 400) {
    const data = (await res.json().catch(() => ({}))) as { detail?: string };
    return Response.json({ error: data.detail ?? "Please check your name and email." }, { status: 400 });
  }
  if (!res.ok) {
    return Response.json({ error: "Couldn't send your message. Please try again." }, { status: 502 });
  }
  return Response.json({ ok: true });
}
