import { sendBody } from "@/lib/ent/consultant-ws/profile-bff";

/** PUT /api/orgs/{orgId}/me-workspace/profile/employment-types: forwarded to the API (it owns validation and the PII scanner). */
export async function PUT(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return sendBody(request, params, "PUT", "/employment-types");
}
