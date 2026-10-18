import { headers } from "next/headers";
import { SURFACE_HEADER } from "@/lib/tenant-host";

/**
 * Kiwiply's own page chrome (cookie consent / analytics, the bug-report widget) wraps in this (X2.6, X1.4 spec gap b).
 *
 * A tenant host is the organization's own product: no Kiwiply banner, no Kiwiply analytics script, no "report a bug to Kiwiply"
 * button on any of its pages (sign-in, join, forgot, workspace). `proxy.ts` stamps every request it handles with
 * `x-kiwiply-surface: platform | tenant` (always overwritten, never the browser's), and the tenant surface renders nothing here.
 * A request the proxy did not stamp is the platform, so today's pages are unchanged.
 */
export default async function PlatformChrome({ children }: { children: React.ReactNode }) {
  let surface: string | null = null;
  try {
    surface = (await headers()).get(SURFACE_HEADER);
  } catch {
    surface = null; // outside a request (static generation): the platform
  }
  return surface === "tenant" ? null : <>{children}</>;
}
