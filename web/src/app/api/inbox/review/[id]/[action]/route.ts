import { actOnReview } from "@/lib/inbox-review-bff";

/** POST /api/inbox/review/:id/(accept|dismiss): accept takes an optional `{ applicationId }`; dismiss changes nothing. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await ctx.params;
  return actOnReview(request, "/api/profile/inbox", id, action);
}
