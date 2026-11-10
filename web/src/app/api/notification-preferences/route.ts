import { forward } from "@/lib/resume-doc-proxy";

const SPRING = "/api/profile/notification-preferences";

/** GET /api/notification-preferences: my notification switches, quiet hours and time zone (E2E-U7.0). */
export async function GET() {
  return forward(SPRING);
}

/** PUT /api/notification-preferences: the autosave target (the whole panel). Spring's 422 and a demo account's 403 pass through. */
export async function PUT(request: Request) {
  const body = await request.text();
  if (!body) return Response.json({ error: "Nothing to save." }, { status: 400 });
  return forward(SPRING, { method: "PUT", body });
}
