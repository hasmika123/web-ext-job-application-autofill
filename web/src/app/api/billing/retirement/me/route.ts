import { passThrough } from "@/lib/subscription/bff";

/** GET /api/billing/retirement/me: the signed-in subscriber's retirement notice (what they use, the suggestion, other options, the fallback) or `{ retirement: null }`. */
export async function GET() {
  return passThrough("/api/billing/retirement/me", null, { method: "GET" });
}
