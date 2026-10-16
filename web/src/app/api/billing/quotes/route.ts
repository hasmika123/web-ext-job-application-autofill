import { passThrough } from "@/lib/subscription/bff";

/** POST /api/billing/quotes: price a basket (CHECKOUT, CHANGE, or anonymous for the pricing page). The API's answer goes back verbatim. */
export async function POST(request: Request) {
  const text = await request.text();
  return passThrough("/api/billing/quotes", request, { method: "POST", body: text || "{}" });
}
