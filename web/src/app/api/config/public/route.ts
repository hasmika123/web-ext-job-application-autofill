import { getPublicConfig } from "@/lib/public-config";

/** GET /api/config/public - the API's two public switches (`{orgs, demo}`), for a client component that needs them. */
export async function GET() {
  return Response.json(await getPublicConfig(), { headers: { "cache-control": "public, max-age=60" } });
}
