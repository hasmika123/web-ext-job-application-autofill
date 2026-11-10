import { forward } from "@/lib/resume-doc-proxy";

/**
 * POST /api/resumes/built — create a built resume + its first document, seeded from the profile.
 * Body `{templateId?, target?, label?}` → 201 `{resume, doc}`. The Free/Pro resume cap comes back as
 * 402 `RESUME_LIMIT {limit, count, plan}` (relayed verbatim, the same shape `/api/resumes/upload`
 * uses) so the "New resume" button can show the upgrade copy.
 */
export async function POST(request: Request) {
  const body = (await request.text()).trim() || "{}";
  return forward("/api/profile/resumes/built", { method: "POST", body });
}
