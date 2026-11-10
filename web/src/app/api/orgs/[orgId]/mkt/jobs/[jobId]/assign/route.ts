import { badBody, forward, onlyFields, readObject } from "@/lib/admin-proxy";

/**
 * POST /api/orgs/{orgId}/mkt/jobs/{jobId}/assign {consultantId, confirmDuplicate?, duplicateReason?}: records an ASSIGNED match for a consultant in the caller's scope.
 * A record only (E1): it never submits an application for the consultant. The API owns permission (opportunities.manage), scope and every duplicate rule;
 * the two optional fields answer a 409 DUPLICATE_WARNING (confirm with a reason).
 */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string; jobId: string }> }) {
  const { orgId, jobId } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(jobId)) return Response.json({ error: "Not found." }, { status: 404 });
  const body = await readObject(req);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, ["consultantId", "confirmDuplicate", "duplicateReason"]);
  if (bad) return badBody(bad);
  if (typeof body.consultantId !== "number" || !Number.isSafeInteger(body.consultantId) || body.consultantId <= 0) return badBody("Choose a consultant.");
  return forward(`/api/orgs/${orgId}/mkt/jobs/${jobId}/assign`, { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ consultantId: body.consultantId, ...(body.confirmDuplicate === true && typeof body.duplicateReason === "string" ? { confirmDuplicate: true, duplicateReason: body.duplicateReason } : {}) }) });
}
