import { DRAFT_PER_MIN, limited, OTHER_PER_MIN } from "@/lib/onboarding/bff";
import { forward } from "@/lib/resume-doc-proxy";

/**
 * PUT /api/profile/onboarding/draft - save the setup draft `{v, step, persona?, stepsDone, stepsTotal, state,
 * baseUpdatedAt?, force?}`. DELETE - start over. POST is the same as PUT, because `navigator.sendBeacon` can only POST
 * (the page flushes an unsent draft that way when it is hidden or closed). A thin proxy (Onboarding v2 R1.9, DESIGN 9):
 * Spring's 409 `DRAFT_CONFLICT {serverUpdatedAt}`, 413 `DRAFT_TOO_LARGE {max}`, 422 `SENSITIVE_CONTENT {path, class}` /
 * `DRAFT_INVALID {path}` and the demo 403 are relayed verbatim. Saves are rate limited (60 a minute).
 */
async function save(request: Request): Promise<Response> {
  const over = limited(request, "onboarding-draft", DRAFT_PER_MIN);
  if (over) return over;
  const body = await request.text();
  if (!body.trim()) return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  return forward("/api/profile/onboarding/draft", { method: "PUT", body });
}

export const PUT = save;
export const POST = save;

export async function DELETE(request: Request) {
  const over = limited(request, "onboarding", OTHER_PER_MIN);
  if (over) return over;
  return forward("/api/profile/onboarding/draft", { method: "DELETE" });
}
