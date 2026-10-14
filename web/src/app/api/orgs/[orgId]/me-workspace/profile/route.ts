import { getProfile } from "@/lib/ent/consultant-ws/profile-bff";

/** GET /api/orgs/{orgId}/me-workspace/profile: the signed-in consultant's own career profile. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return getProfile(params);
}
