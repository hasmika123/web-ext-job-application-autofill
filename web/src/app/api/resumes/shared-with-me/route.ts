import { forward } from "@/lib/resume-doc-proxy";

/** GET /api/resumes/shared-with-me - the resumes other people (or my organisation's marketer) shared with me (R3.11). */
export async function GET() {
  return forward("/api/profile/resumes/shared-with-me");
}
