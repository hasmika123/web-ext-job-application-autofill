import { offersCall } from "../../_bff/shared";

/** POST .../offers/{id}/accept: records the consultant's acceptance only; nothing is signed or sent to a client and no placement is created. */
export async function POST(_req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  return offersCall(params, "/accept", { method: "POST" });
}
