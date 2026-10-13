import { proxyPost } from "@/lib/ent/marketer-ws/opportunities-bff";

/** POST .../opportunities/{id}/review: record that the marketer reviewed the opportunity. */
export async function POST(_req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  return proxyPost(orgId, "/review", id);
}
