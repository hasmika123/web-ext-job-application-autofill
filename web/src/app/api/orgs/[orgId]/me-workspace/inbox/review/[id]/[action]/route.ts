import { reviewAct } from "../../../_bff/review";

/** POST /api/orgs/{orgId}/me-workspace/inbox/review/{id}/(accept|dismiss). */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string; id: string; action: string }> }) {
  return reviewAct(request, params);
}
