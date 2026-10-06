/**
 * Shared answer shaping for the job-source admin proxies (Phase 13.6a): Spring's problem JSON becomes
 * `{ error }` with the same status; success passes through.
 */
export async function passthrough(res: Response): Promise<Response> {
  if (res.status === 401) {
    return Response.json({ error: "Your session expired — please sign in again." }, { status: 401 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data as { detail?: string; title?: string; message?: string; running?: boolean };
    const error = res.status === 409 && d.running ? "That is already running." : (d.detail ?? d.title ?? d.message ?? "The action failed.");
    return Response.json({ error }, { status: res.status });
  }
  return Response.json(data, { status: res.status });
}
