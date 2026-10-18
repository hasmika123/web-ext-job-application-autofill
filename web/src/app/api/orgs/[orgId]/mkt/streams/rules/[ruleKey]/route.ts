import { RULE_FIELDS, bodyOf, forward, notFound, ruleKeyOk, streamsPath } from "@/lib/ent/marketer-ws/streams-bff";

/** PATCH /api/orgs/{orgId}/mkt/streams/rules/{ruleKey}: toggle a stream rule or edit its value. */
export async function PATCH(req: Request, { params }: { params: Promise<{ orgId: string; ruleKey: string }> }) {
  const { orgId, ruleKey } = await params;
  const path = ruleKeyOk(ruleKey) ? streamsPath(orgId, `/rules/${ruleKey}`) : null;
  if (!path) return notFound();
  const body = await bodyOf(req, RULE_FIELDS);
  if (body instanceof Response) return body;
  return forward(path, { method: "PATCH", body: JSON.stringify(body) });
}
