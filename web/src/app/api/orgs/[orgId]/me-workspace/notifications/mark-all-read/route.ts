import { postEmpty } from "../_bff/shared";

/** POST .../notifications/mark-all-read: every unresolved, unread notification of the caller. */
export async function POST(_request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return postEmpty(params, "/mark-all-read");
}
