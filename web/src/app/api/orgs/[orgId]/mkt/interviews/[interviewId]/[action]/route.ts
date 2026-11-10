import { forward, readObject } from "@/lib/admin-proxy";

/**
 * POST /api/orgs/{orgId}/mkt/interviews/{interviewId}/{action}. The four things a marketer may RECORD or PROPOSE on an interview:
 * `reschedule` (a proposal), `confirm` (record that a slot was confirmed), `feedback`, `remind` (a reminder request). Anything else is a 404;
 * there is no action here that submits for a consultant.
 */
const ACTIONS = new Set(["reschedule", "confirm", "feedback", "remind"]);

export async function POST(request: Request, { params }: { params: Promise<{ orgId: string; interviewId: string; action: string }> }) {
  const { orgId, interviewId, action } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(interviewId) || !ACTIONS.has(action)) return Response.json({ error: "Not found." }, { status: 404 });
  const body = (await readObject(request)) ?? {};
  return forward(`/api/orgs/${orgId}/mkt/interviews/${interviewId}/${action}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { accept: "application/json", "content-type": "application/json" },
  });
}
