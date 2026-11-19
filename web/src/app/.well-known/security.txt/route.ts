import { headers } from "next/headers";
import { securityTxt } from "@/lib/security-txt";
import { SURFACE_HEADER } from "@/lib/tenant-host";

/**
 * GET /.well-known/security.txt (gap D-5): the vulnerability report contact, on Kiwiply's own hosts only. A tenant host (a consultancy's own
 * domain or its Kiwiply subdomain) answers 404: those pages never name Kiwiply. The proxy always overwrites the surface header, so a browser
 * can not claim to be on the platform.
 */
export async function GET() {
  const surface = (await headers()).get(SURFACE_HEADER);
  if (surface !== "platform") return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return new Response(securityTxt(), {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" },
  });
}
