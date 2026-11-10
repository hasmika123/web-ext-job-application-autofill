import { getDemoInfo } from "@/lib/demo-server";

/**
 * GET /api/demo — public proxy for "are the demo accounts on, and which ones?".
 * Never cached. If the API is unreachable (or predates the demo), answer "off" rather than an
 * error: the caller only needs to know whether to draw the demo buttons.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const info = await getDemoInfo();
  return Response.json(info ?? { enabled: false, accounts: [] }, { headers: { "cache-control": "no-store" } });
}
