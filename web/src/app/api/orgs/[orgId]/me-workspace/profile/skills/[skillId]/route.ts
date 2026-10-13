import { remove } from "@/lib/ent/consultant-ws/profile-bff";

/** DELETE /api/orgs/{orgId}/me-workspace/profile/skills/{skillId}: the API answers 404 unless the row is the caller's own. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ orgId: string; skillId: string }> }) {
  return remove(params, "skillId", "/skills");
}
