import { limited, OTHER_PER_MIN } from "@/lib/onboarding/bff";
import { forward } from "@/lib/resume-doc-proxy";

/**
 * GET /api/profile/onboarding[?include=state] - the signed-in user's onboarding status (NONE / DRAFT / FINISHED, the
 * persona, the draft summary, the dashboard card decision and the completeness thresholds); the draft's `state` only
 * with `?include=state`. PATCH - `{persona?, card?: {action: SNOOZE | DISMISS | RESET}}` -> the new status. A thin proxy
 * (Onboarding v2 R1.9, DESIGN 9): Spring's answers and refusals (`PERSONA_INVALID`, `DEMO_READ_ONLY`) pass through unchanged.
 */
export async function GET(request: Request) {
  const include = new URL(request.url).searchParams.get("include");
  return forward(`/api/profile/onboarding${include === "state" ? "?include=state" : ""}`);
}

export async function PATCH(request: Request) {
  const over = limited(request, "onboarding", OTHER_PER_MIN);
  if (over) return over;
  const body = await request.text();
  if (!body.trim()) return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  return forward("/api/profile/onboarding", { method: "PATCH", body });
}
