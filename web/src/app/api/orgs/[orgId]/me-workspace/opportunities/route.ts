import { opportunitiesCall } from "./_bff/shared";

/** GET /api/orgs/{orgId}/me-workspace/opportunities: the signed-in consultant's own Assigned Opportunities page (sort, page and size pass through). */
export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const q = new URL(req.url).searchParams;
  const keep = new URLSearchParams();
  for (const k of ["sort", "page", "size"]) {
    const v = q.get(k);
    if (v !== null && /^[a-z0-9]{1,12}$/i.test(v)) keep.set(k, v);
  }
  const s = keep.toString();
  return opportunitiesCall(params, {}, undefined, s ? `?${s}` : "");
}
