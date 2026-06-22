import { apiUrl } from "@/lib/config";
import { getAccessToken } from "@/lib/auth";

/**
 * POST /api/resumes/upload — Option A proxy upload (the permanent design on a
 * long-running container; no serverless body limit). The browser sends the file +
 * label + parsed JSON; this handler creates the resume row, then uploads the file
 * bytes to the owner-scoped Spring endpoint. The browser never calls Spring/R2
 * directly, and the JWT stays server-side.
 *
 * Files are capped at 10MB. (formData() buffers; at this cap that's fine. True
 * streaming pass-through is a later refinement if the cap ever grows.)
 */
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const token = await getAccessToken();
  if (!token) {
    return Response.json({ error: "You're not signed in." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Invalid upload." }, { status: 400 });
  }

  const file = form.get("file");
  const label = ((form.get("label") as string | null) ?? "").trim() || "Resume";
  const parsedJson = (form.get("parsedJson") as string | null) ?? "";

  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "That file is too large (max 10MB)." }, { status: 413 });
  }

  const auth = { authorization: `Bearer ${token}` };

  // 1) Create the resume metadata row (server fills user, createdAt, empty object key).
  let createRes: Response;
  try {
    createRes = await fetch(apiUrl("/api/profile/resumes"), {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ label, parsedJson, status: "NEEDS_REVIEW" }),
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  if (createRes.status === 401) {
    return Response.json({ error: "Your session expired — please sign in again." }, { status: 401 });
  }
  if (!createRes.ok) {
    return Response.json({ error: "Couldn't save the resume." }, { status: 502 });
  }
  const created = (await createRes.json()) as { id?: number };
  if (!created.id) {
    return Response.json({ error: "Unexpected response from the server." }, { status: 502 });
  }

  // 2) Upload the file bytes to the owner-scoped file endpoint.
  const fileForm = new FormData();
  fileForm.append("file", file, file.name);
  let fileRes: Response;
  try {
    fileRes = await fetch(apiUrl(`/api/resumes/${created.id}/file`), {
      method: "POST",
      headers: auth, // let fetch set the multipart content-type + boundary
      body: fileForm,
      cache: "no-store",
    });
  } catch {
    await rollback(created.id, auth);
    return Response.json({ error: "Couldn't upload the file. Please try again." }, { status: 502 });
  }
  if (!fileRes.ok) {
    await rollback(created.id, auth);
    return Response.json({ error: "Couldn't upload the file. Please try again." }, { status: 502 });
  }

  return Response.json({ ok: true, id: created.id, label });
}

/** Best-effort: drop the metadata row if the file upload failed, so we don't leave
 *  an empty resume behind. */
async function rollback(id: number, auth: Record<string, string>) {
  try {
    await fetch(apiUrl(`/api/profile/resumes/${id}`), { method: "DELETE", headers: auth, cache: "no-store" });
  } catch {
    // ignore — best effort
  }
}
