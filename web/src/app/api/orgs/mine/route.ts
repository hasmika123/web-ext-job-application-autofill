import { forward } from "@/lib/resume-doc-proxy";

/** GET /api/orgs/mine - the organizations the caller is an ACTIVE member of (drives the switcher). Scoped by the caller, never by an id. */
export async function GET() {
  return forward("/api/orgs/mine");
}
