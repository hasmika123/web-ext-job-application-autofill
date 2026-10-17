import { basePath, forward, forwardBody, notFound } from "@/lib/ent/marketer-ws/submissions-bff";

/** GET /api/orgs/{orgId}/mkt/submissions: the whole Submissions board in one call (filters ride the query string; the API validates them). */
export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const p = basePath((await params).orgId);
  if (!p) return notFound();
  return forward(`${p}${new URL(request.url).search}`, { headers: { accept: "application/json" } });
}

/** POST /api/orgs/{orgId}/mkt/submissions: prepare a package for a job (creates a DRAFT record; nothing is sent to anyone). `confirmDuplicate` + `duplicateReason` answer a 409 DUPLICATE_WARNING. */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const p = basePath((await params).orgId);
  if (!p) return notFound();
  return forwardBody(request, p, "POST", ["consultantId", "requirementId", "resumeId", "note", "confirmDuplicate", "duplicateReason"]);
}
