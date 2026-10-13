import { matchesCall } from "../../_bff/shared";

type P = { params: Promise<{ orgId: string; matchId: string }> };

/** PUT .../matches/{matchId}/save: bookmark the job. */
export async function PUT(_req: Request, { params }: P) {
  return matchesCall(params, "/save", { method: "PUT" });
}

/** DELETE .../matches/{matchId}/save: remove the bookmark. */
export async function DELETE(_req: Request, { params }: P) {
  return matchesCall(params, "/save", { method: "DELETE" });
}
