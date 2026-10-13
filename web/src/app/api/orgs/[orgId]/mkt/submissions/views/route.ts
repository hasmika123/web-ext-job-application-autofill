import { basePath, forwardBody, notFound } from "@/lib/ent/marketer-ws/submissions-bff";

/** POST /api/orgs/{orgId}/mkt/submissions/views: "Save View" (the caller's own named filter set). */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const p = basePath((await params).orgId);
  if (!p) return notFound();
  return forwardBody(request, `${p}/views`, "POST", ["name", "q", "status", "approval", "clientId", "jobTitle", "period"]);
}
