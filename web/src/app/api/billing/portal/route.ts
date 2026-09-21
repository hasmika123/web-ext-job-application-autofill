import { serverApiFetch } from "@/lib/api";

/**
 * POST /api/billing/portal — open the Stripe Billing Portal and return `{url}`.
 *
 * This is the click-to-cancel path (FTC rule / California ARL), so it must stay a plain,
 * always-available link rather than anything that can quietly fail: the status is passed
 * through so the UI can say "you don't have a billing account yet" (404) rather than
 * swallowing it.
 */
export async function POST() {
  try {
    const res = await serverApiFetch("/api/billing/portal", { method: "POST" });
    const text = await res.text();
    return new Response(text, { status: res.status, headers: { "content-type": "application/json" } });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
}
