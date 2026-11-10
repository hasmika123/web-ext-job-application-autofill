import { forward } from "@/lib/admin-proxy";
import { FEATURE_KEY, notFound } from "@/lib/admin-plans-bff";

/** GET - what a service requires (TECHNICAL ones are pre-added to a plan by the editor). */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!FEATURE_KEY.test(key)) return notFound();
  return forward(`/api/admin/catalog/services/${encodeURIComponent(key)}/dependencies`);
}
