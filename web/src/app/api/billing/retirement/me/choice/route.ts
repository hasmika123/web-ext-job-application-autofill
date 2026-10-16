import { passThrough } from "@/lib/subscription/bff";

const CHOICES = ["SWITCH_AT_RENEWAL", "SWITCH_NOW", "STAY_ON_FREE"];

/**
 * POST /api/billing/retirement/me/choice: the subscriber's choice ({ choice, quoteId? }). The Idempotency-Key header rides along. The browser sends a
 * choice and the id of a quote the API itself made; it never sends a price.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ code: "BAD_REQUEST", error: "Send a JSON object." }, { status: 400 });
  const extra = Object.keys(body).filter((k) => k !== "choice" && k !== "quoteId");
  if (extra.length > 0 || typeof body.choice !== "string" || !CHOICES.includes(body.choice)) return Response.json({ code: "BAD_REQUEST", error: "Unknown choice." }, { status: 400 });
  if (body.quoteId !== undefined && (typeof body.quoteId !== "number" || !Number.isSafeInteger(body.quoteId) || body.quoteId < 1)) return Response.json({ code: "BAD_REQUEST", error: "quoteId is a number." }, { status: 400 });
  return passThrough("/api/billing/retirement/me/choice", request, { method: "POST", body: JSON.stringify(body) });
}
