import { forwardObject, notFound, PLAN_KEY, VERSION_NO } from "@/lib/admin-plans-bff";

/** PUT - the full list of components of a DRAFT version (autosave). */
export async function PUT(request: Request, { params }: { params: Promise<{ planKey: string; v: string }> }) {
  const { planKey, v } = await params;
  if (!PLAN_KEY.test(planKey) || !VERSION_NO.test(v)) return notFound();
  return forwardObject(request, `/api/admin/plans/${planKey}/versions/${v}/components`, "PUT", ["components", "expectedUpdatedAt"]);
}
