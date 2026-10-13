import { badBody, forward, readObject } from "@/lib/admin-proxy";

/** PATCH /api/orgs/{orgId}/mkt/interviews/{interviewId}/prep/{itemId}: tick or untick one checklist item ({ done }). */
export async function PATCH(request: Request, { params }: { params: Promise<{ orgId: string; interviewId: string; itemId: string }> }) {
  const { orgId, interviewId, itemId } = await params;
  if (![orgId, interviewId, itemId].every((v) => /^\d{1,18}$/.test(v))) return Response.json({ error: "Not found." }, { status: 404 });
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  return forward(`/api/orgs/${orgId}/mkt/interviews/${interviewId}/prep/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ done: body.done === true }),
    headers: { accept: "application/json", "content-type": "application/json" },
  });
}
