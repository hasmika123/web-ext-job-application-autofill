import { sendBody } from "@/lib/ent/consultant-ws/profile-bff";

/** POST /api/orgs/{orgId}/me-workspace/profile/certifications: forwarded to the API (it owns validation and the PII scanner). */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return sendBody(request, params, "POST", "/certifications");
}
