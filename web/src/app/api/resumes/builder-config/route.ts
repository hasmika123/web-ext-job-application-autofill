import { forward } from "@/lib/resume-doc-proxy";

/**
 * GET /api/resumes/builder-config — the Resume Builder settings for the signed-in user (limits, score
 * weights, templates, feature flags, plan, resume cap). Server Components read the same object
 * through `getBuilderConfig()` in `@/lib/resume-builder-config`; this route serves client-side
 * refreshes. A thin proxy: Spring's JSON and `ETag` are relayed unchanged.
 */
export async function GET() {
  return forward("/api/profile/resume-builder/config");
}
