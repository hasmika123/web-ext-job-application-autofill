import { clearAuthCookies } from "@/lib/auth";
import { forward } from "@/lib/resume-doc-proxy";

const SPRING = "/api/account/deletion-request";

/**
 * GET /api/account/deletion-request: is a deletion of my account pending, and until when can I undo it?
 * Spring answers 404 for an enterprise account (employer-managed, no self-service erasure); the 404 passes through
 * and the Settings panel hides the control.
 */
export async function GET() {
  return forward(SPRING);
}

/**
 * POST /api/account/deletion-request: schedule the erasure after the undo window (202). When an admin set the window to 0
 * hours Spring erases at once and answers `DELETED`; then the session is already dead server-side, so the cookies go too.
 */
export async function POST() {
  const res = await forward(SPRING, { method: "POST" });
  if (res.ok) {
    const body = (await res.clone().json().catch(() => null)) as { status?: string } | null;
    if (body?.status === "DELETED") await clearAuthCookies();
  }
  return res;
}

/** DELETE /api/account/deletion-request: withdraw the pending request (the undo). */
export async function DELETE() {
  return forward(SPRING, { method: "DELETE" });
}
