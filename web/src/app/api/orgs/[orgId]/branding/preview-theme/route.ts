import { forward, notFound, orgPath } from "@/lib/ent/branding-bff";

/** GET /api/orgs/{orgId}/branding/preview-theme?primary=&secondary=: can white text be read on these colours? */
export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const p = orgPath((await params).orgId);
  if (!p) return notFound();
  const q = new URL(request.url).searchParams;
  const out = new URLSearchParams();
  for (const k of ["primary", "secondary", "accent"]) {
    const v = q.get(k);
    if (v && v.length <= 9) out.set(k, v);
  }
  return forward(`${p}/preview-theme?${out}`);
}
