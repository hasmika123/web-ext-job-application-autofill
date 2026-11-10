import { forward } from "@/lib/resume-doc-proxy";

const SPRING = "/api/account/terms-acceptance";

/** GET /api/account/terms-acceptance: which terms and privacy-notice versions are in force, and which ones I accepted. */
export async function GET() {
  return forward(SPRING);
}

/**
 * POST /api/account/terms-acceptance: record that I accepted `{document: "TERMS" | "PRIVACY", version, source?}`. Only the three known
 * fields go to Spring. The version must be the one in force (Spring's 4xx explains if not). Nothing calls this from sign-up yet.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { document?: unknown; version?: unknown; source?: unknown } | null;
  if (!body || typeof body !== "object") return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  if (body.document !== "TERMS" && body.document !== "PRIVACY") return Response.json({ error: "document must be TERMS or PRIVACY." }, { status: 400 });
  if (typeof body.version !== "string" || !body.version.trim() || body.version.length > 32) return Response.json({ error: "version is required." }, { status: 400 });
  if (body.source !== undefined && (typeof body.source !== "string" || body.source.length > 64)) return Response.json({ error: "source must be a short string." }, { status: 400 });
  const out: Record<string, string> = { document: body.document, version: body.version };
  if (typeof body.source === "string") out.source = body.source;
  return forward(SPRING, { method: "POST", body: JSON.stringify(out) });
}
