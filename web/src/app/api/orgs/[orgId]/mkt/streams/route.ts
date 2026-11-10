import { STREAM_FIELDS, bodyOf, forward, notFound, streamsPath } from "@/lib/ent/marketer-ws/streams-bff";

/** GET /api/orgs/{orgId}/mkt/streams: the Job Streams board (one call; q, source, status, client, showInactive, page, size, sort, days). */
export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const path = streamsPath((await params).orgId);
  if (!path) return notFound();
  return forward(`${path}${new URL(req.url).search}`, { headers: { accept: "application/json" } });
}

/** POST /api/orgs/{orgId}/mkt/streams: add a job stream (records the configuration; connects to nothing). */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const path = streamsPath((await params).orgId);
  if (!path) return notFound();
  const body = await bodyOf(req, STREAM_FIELDS);
  if (body instanceof Response) return body;
  return forward(path, { method: "POST", body: JSON.stringify(body) });
}
