import { postEmpty } from "../_bff/shared";

/** POST .../notifications/mute-non-critical: switch off the non-critical categories (answers the previous settings for Undo). */
export async function POST(_request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return postEmpty(params, "/mute-non-critical");
}
