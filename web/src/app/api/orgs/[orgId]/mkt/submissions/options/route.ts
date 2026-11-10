import { basePath, forward, notFound } from "@/lib/ent/marketer-ws/submissions-bff";

/** GET /api/orgs/{orgId}/mkt/submissions/options: the choices of the New Submission dialog (assigned consultants, open jobs). */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const p = basePath((await params).orgId);
  return p ? forward(`${p}/options`, { headers: { accept: "application/json" } }) : notFound();
}
