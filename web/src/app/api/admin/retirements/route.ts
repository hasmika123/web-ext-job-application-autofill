import { forward } from "@/lib/admin-proxy";
import { forwardObject, pickQuery } from "@/lib/admin-plans-bff";

const START_FIELDS = ["planKey", "planVersion", "mode", "defaultOutcome", "effectiveNotBefore", "successors", "noticeScheduleDays", "channels", "messageMd", "reason", "confirmPlanKey"] as const;

/** GET ?planKey=&status= - the retirements of a plan (or all), newest first. */
export async function GET(request: Request) {
  return forward(`/api/admin/retirements${pickQuery(request, ["planKey", "status"])}`);
}

/** POST (HIGH: `reason`, `confirmPlanKey`) - start a retirement. Shape is checked here; every rule (notice floor, price guard) is the API's. */
export async function POST(request: Request) {
  return forwardObject(request, "/api/admin/retirements", "POST", START_FIELDS);
}
