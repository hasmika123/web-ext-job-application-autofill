import { forward } from "@/lib/resume-doc-proxy";

/** GET /api/profile/completeness - `{score, parts, nextAction}` (the profile meter, computed by the API). */
export async function GET() {
  return forward("/api/profile/completeness");
}
