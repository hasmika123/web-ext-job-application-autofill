import { serverApiFetch } from "@/lib/api";

/**
 * GET /api/billing/me — the current user's plan.
 *
 * Exists for CLIENT components (the success page polls it after checkout). Server Components
 * use `getPlan()` in `@/lib/billing` directly instead of going through this hop.
 */
export async function GET() {
  try {
    const res = await serverApiFetch("/api/billing/me");
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
}
