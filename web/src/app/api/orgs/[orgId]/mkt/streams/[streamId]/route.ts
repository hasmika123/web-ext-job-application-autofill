import { STREAM_FIELDS, bodyOf, forward, notFound, streamIdOk, streamsPath } from "@/lib/ent/marketer-ws/streams-bff";

/** PATCH /api/orgs/{orgId}/mkt/streams/{streamId}: configure a stream (only the fields sent change). */
export async function PATCH(req: Request, { params }: { params: Promise<{ orgId: string; streamId: string }> }) {
  const { orgId, streamId } = await params;
  const path = streamIdOk(streamId) ? streamsPath(orgId, `/${streamId}`) : null;
  if (!path) return notFound();
  const body = await bodyOf(req, STREAM_FIELDS);
  if (body instanceof Response) return body;
  return forward(path, { method: "PATCH", body: JSON.stringify(body) });
}
