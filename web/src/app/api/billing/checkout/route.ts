import { serverApiFetch } from "@/lib/api";

/**
 * POST /api/billing/checkout — start a Stripe Checkout and return `{url}` for the browser to
 * follow.
 *
 * The API's response is passed through verbatim, status and all, because the interesting cases
 * are its error codes and the UI branches on them: `ALREADY_SUBSCRIBED` (409),
 * `BILLING_DISABLED` (503), `UNKNOWN_PRICE` (400). Flattening those into a generic failure
 * would turn "you're already subscribed" into "something went wrong".
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { plan?: unknown } | null;
  if (body?.plan !== "monthly" && body?.plan !== "3mo") {
    return Response.json({ error: "Unknown plan.", code: "UNKNOWN_PRICE" }, { status: 400 });
  }

  try {
    const res = await serverApiFetch("/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ plan: body.plan }),
    });
    const text = await res.text();
    return new Response(text, { status: res.status, headers: { "content-type": "application/json" } });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
}
