import { forward, notFound, orgPath } from "@/lib/ent/branding-bff";

/** POST /api/orgs/{orgId}/branding/publish: makes the draft live and appends a version (X2.5). */
export async function POST(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const p = orgPath((await params).orgId);
  return p ? forward(`${p}/publish`, { method: "POST" }) : notFound();
}
