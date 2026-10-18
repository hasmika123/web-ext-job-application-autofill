import { prepareCreate } from "@/lib/ent/consultant-ws/prepare-bff";

/** POST /api/orgs/{orgId}/consultant/prepare (forwarded to the API's /con/prepare): plan a batch of the signed-in consultant's own assigned openings. The API resolves WHICH consultant from the session. */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return prepareCreate(req, orgId);
}
