import type { Metadata } from "next";
import TenantConnect from "@/components/ent/connect/TenantConnect";
import { getTenant } from "@/lib/tenant";

/**
 * `acme.localhost/connect`, rewritten here by `proxy.ts`: the organization's own page that signs the browser extension in. Not a public path,
 * so a signed-out visitor is sent to the organization's sign-in first and comes back here.
 */
export const metadata: Metadata = { title: "Connect the extension" };

export default async function TenantConnectPage() {
  const t = await getTenant();
  if (t.kind !== "TENANT") return null; // the layout already answered
  return <TenantConnect name={t.tenant.displayName} logoUrl={t.tenant.branding?.logoUrl} />;
}
