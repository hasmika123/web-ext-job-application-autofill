import { forward, notFound, streamIdOk, streamsPath } from "@/lib/ent/marketer-ws/streams-bff";

/** POST /api/orgs/{orgId}/mkt/streams/{streamId}/pause: mark a stream paused (records a setting; stops nothing external). */
export async function POST(_req: Request, { params }: { params: Promise<{ orgId: string; streamId: string }> }) {
  const { orgId, streamId } = await params;
  const path = streamIdOk(streamId) ? streamsPath(orgId, `/${streamId}/pause`) : null;
  return path ? forward(path, { method: "POST" }) : notFound();
}
