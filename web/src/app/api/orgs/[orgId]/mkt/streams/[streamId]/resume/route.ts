import { forward, notFound, streamIdOk, streamsPath } from "@/lib/ent/marketer-ws/streams-bff";

/** POST /api/orgs/{orgId}/mkt/streams/{streamId}/resume: mark a paused stream active again. */
export async function POST(_req: Request, { params }: { params: Promise<{ orgId: string; streamId: string }> }) {
  const { orgId, streamId } = await params;
  const path = streamIdOk(streamId) ? streamsPath(orgId, `/${streamId}/resume`) : null;
  return path ? forward(path, { method: "POST" }) : notFound();
}
