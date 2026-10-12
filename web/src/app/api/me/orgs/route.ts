import { forward } from "@/lib/org-proxy";

/** GET /api/me/orgs - the organizations the caller belongs to and what each can see (O6.2). */
export async function GET() {
  return forward("/api/me/orgs");
}
