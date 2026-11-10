import { badBody, forward, onlyFields, readObject } from "@/lib/admin-proxy";
import { notFound, PLAN_KEY, VERSION_NO } from "@/lib/admin-plans-bff";

/**
 * POST - publish a DRAFT version (HIGH). The browser's `adminFetch` cannot set headers, so the attempt's `idempotencyKey` rides
 * in the body and becomes the `Idempotency-Key` header here (the API refuses a publish without one: 400 IDEMPOTENCY_KEY_REQUIRED).
 * Body: { idempotencyKey, confirmVersion, reason, overrideReason?, effectiveFrom? }.
 */
export async function POST(request: Request, { params }: { params: Promise<{ planKey: string; v: string }> }) {
  const { planKey, v } = await params;
  if (!PLAN_KEY.test(planKey) || !VERSION_NO.test(v)) return notFound();
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, ["idempotencyKey", "confirmVersion", "reason", "overrideReason", "effectiveFrom"]);
  if (bad) return badBody(bad);
  const { idempotencyKey, ...rest } = body;
  const headers: Record<string, string> = {};
  if (typeof idempotencyKey === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(idempotencyKey)) headers["Idempotency-Key"] = idempotencyKey;
  return forward(`/api/admin/plans/${planKey}/versions/${v}/publish`, { method: "POST", body: JSON.stringify(rest), headers });
}
