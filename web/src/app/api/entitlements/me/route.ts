import { passThrough } from "@/lib/subscription/bff";

/** GET /api/entitlements/me: what the signed-in personal account may use (plan features plus add-ons) with the meters. */
export async function GET() {
  return passThrough("/api/entitlements/me", null, { method: "GET" });
}
