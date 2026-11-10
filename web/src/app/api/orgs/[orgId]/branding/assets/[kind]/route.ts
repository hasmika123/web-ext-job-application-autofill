import { badBody, forward, KINDS, notFound, orgPath } from "@/lib/ent/branding-bff";

/** Upper bound on what the BFF will buffer; the API enforces the real per-kind caps (logo 512 KB, favicon 256 KB, banner 2 MB). */
const MAX_BYTES = 3 * 1024 * 1024;

const kindOf = (kind: string) => (KINDS as readonly string[]).includes(kind);

/** POST /api/orgs/{orgId}/branding/assets/{kind}: multipart field `file`, raster only (the API decides by magic bytes). */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string; kind: string }> }) {
  const { orgId, kind } = await params;
  const p = orgPath(orgId);
  if (!p || !kindOf(kind)) return notFound();
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badBody("Send the image as multipart form data.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return badBody("No file provided.");
  if (file.size > MAX_BYTES) return Response.json({ error: "That file is too large.", code: "BRANDING_ASSET_TOO_LARGE" }, { status: 413 });
  const fd = new FormData();
  fd.append("file", file, file.name);
  return forward(`${p}/assets/${kind}`, { method: "POST", body: fd });
}

/** DELETE /api/orgs/{orgId}/branding/assets/{kind}: take the asset out of the draft. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ orgId: string; kind: string }> }) {
  const { orgId, kind } = await params;
  const p = orgPath(orgId);
  if (!p || !kindOf(kind)) return notFound();
  return forward(`${p}/assets/${kind}`, { method: "DELETE" });
}
