import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";
import type { OrgSummary } from "@/lib/admin-orgs";
import OrganizationsPage from "@/components/admin-v3/organizations/OrganizationsPage";

export const metadata: Metadata = {
  title: "Organizations · Admin",
  robots: { index: false, follow: false },
};

/** The platform admin Organizations list (X1.11). The tiles are read here; the table reads its own pages through the BFF. */
export default async function AdminOrganizationsPage() {
  const res = await serverApiFetch("/api/admin/orgs/summary").catch(() => null);
  const summary = res?.ok ? ((await res.json().catch(() => null)) as OrgSummary | null) : null;
  return <OrganizationsPage summary={summary} baseDomain={await baseDomain()} />;
}

/** The base domain the API builds addresses under, read from a throwaway label check (it echoes {label}.{base}). */
async function baseDomain(): Promise<string> {
  const res = await serverApiFetch("/api/admin/orgs/label-check?label=probe-label").catch(() => null);
  const host = res?.ok ? ((await res.json().catch(() => null)) as { host?: string | null } | null)?.host : null;
  return host && host.includes(".") ? host.slice(host.indexOf(".") + 1) : "kiwiply.com";
}
