import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { serverApiFetch } from "@/lib/api";
import type { OrgDetail } from "@/lib/admin-orgs";
import OrganizationDetailPage from "@/components/admin-v3/organizations/OrganizationDetailPage";

export const metadata: Metadata = {
  title: "Organization · Admin",
  robots: { index: false, follow: false },
};

/** One organization for the platform admin (X1.11): facts, hostnames, the enterprise switch, the owner and the admin audit tail. */
export default async function AdminOrganizationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) notFound();
  const res = await serverApiFetch(`/api/admin/orgs/${id}`).catch(() => null);
  if (res?.status === 404) notFound();
  const org = res?.ok ? ((await res.json().catch(() => null)) as OrgDetail | null) : null;
  return <OrganizationDetailPage initial={org} id={Number(id)} />;
}
