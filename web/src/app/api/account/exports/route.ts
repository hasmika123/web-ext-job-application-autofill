import { forward } from "@/lib/resume-doc-proxy";

const SPRING = "/api/account/exports";

/** GET /api/account/exports: my recent data-export jobs (status, size, and a signed download path while one is ready). */
export async function GET() {
  return forward(SPRING);
}

/**
 * POST /api/account/exports: queue an export of all my data (202; while one is already running Spring answers with that same job).
 * Spring's 429 (the daily limit) passes through so the panel can say why.
 */
export async function POST() {
  return forward(SPRING, { method: "POST" });
}
