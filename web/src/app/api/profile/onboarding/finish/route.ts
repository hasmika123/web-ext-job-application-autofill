import { limited, OTHER_PER_MIN } from "@/lib/onboarding/bff";
import { forward } from "@/lib/resume-doc-proxy";

/**
 * POST /api/profile/onboarding/finish - stamps `finishedAt`, writes `onboardedAt` when blank, deletes the draft and answers
 * `{finishedAt, completeness, coverage: {fields, groups}}` (the honest "~N fields" of the payoff). Idempotent. A thin proxy
 * (Onboarding v2 R1.9, DESIGN 9); the demo 403 is relayed unchanged.
 */
export async function POST(request: Request) {
  const over = limited(request, "onboarding", OTHER_PER_MIN);
  if (over) return over;
  return forward("/api/profile/onboarding/finish", { method: "POST", body: "{}" });
}
