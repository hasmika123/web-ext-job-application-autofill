import { forward, notFound, orgPath } from "@/lib/ent/branding-bff";

/** POST /api/orgs/{orgId}/branding/discard: throws the draft away (back to what is live). */
export async function POST(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const p = orgPath((await params).orgId);
  return p ? forward(`${p}/discard`, { method: "POST" }) : notFound();
}
