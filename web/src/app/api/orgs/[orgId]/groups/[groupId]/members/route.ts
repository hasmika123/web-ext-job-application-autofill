import { badBody, forward, groupsPath, isId, notFound, readObject, writeHeaders } from "@/lib/ent/groups-bff";

/** POST: move people into the group (one or many). The Idempotency-Key header goes through. */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string; groupId: string }> }) {
  const { orgId, groupId } = await params;
  const p = groupsPath(orgId);
  if (!p || !isId(groupId)) return notFound();
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  return forward(`${p}/${groupId}/members`, { method: "POST", body: JSON.stringify(body), headers: writeHeaders(request) });
}
