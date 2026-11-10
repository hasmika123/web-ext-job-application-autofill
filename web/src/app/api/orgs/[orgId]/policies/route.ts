import { forward, notFound, orgPath } from "@/lib/ent/policies-bff";

/** GET /api/orgs/{orgId}/policies: every configured policy kind with its state and what is live. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const p = orgPath((await params).orgId);
  return p ? forward(p) : notFound();
}
