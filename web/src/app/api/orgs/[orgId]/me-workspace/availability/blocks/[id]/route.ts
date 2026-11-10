import { removeBlock, sendBody } from "../../_bff/shared";

/** PUT / DELETE /api/orgs/{orgId}/me-workspace/availability/blocks/{id}: edit or remove one of the caller's own calendar entries. */
export async function PUT(request: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  return sendBody(request, params, "PUT", "/blocks", true);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  return removeBlock(params);
}
