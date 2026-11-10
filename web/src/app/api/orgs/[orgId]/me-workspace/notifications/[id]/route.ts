import { removeOne } from "../_bff/shared";

/** DELETE .../notifications/{id}: delete one of the caller's own notifications (a soft delete). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  return removeOne(params);
}
