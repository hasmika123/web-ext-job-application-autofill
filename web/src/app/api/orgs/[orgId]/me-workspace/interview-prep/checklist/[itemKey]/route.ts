import { prepCall } from "../../_bff/shared";

/** PUT .../interview-prep/checklist/{itemKey}: tick or untick one Before Interview Checklist item. */
export async function PUT(request: Request, { params }: { params: Promise<{ orgId: string; itemKey: string }> }) {
  return prepCall(params, "", { method: "PUT" }, request);
}
