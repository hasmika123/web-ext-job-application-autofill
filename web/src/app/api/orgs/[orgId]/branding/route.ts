import { forward, notFound, orgPath } from "@/lib/ent/branding-bff";

/** GET /api/orgs/{orgId}/branding: published values, the draft, its version and the history (X2.5). */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const p = orgPath((await params).orgId);
  return p ? forward(p) : notFound();
}
