import { prepareStatus } from "@/lib/ent/consultant-ws/prepare-bff";

/** GET /api/orgs/{orgId}/consultant/prepare/status: is Prepare selected on, and what is left of the admin-set limits. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return prepareStatus(orgId);
}
