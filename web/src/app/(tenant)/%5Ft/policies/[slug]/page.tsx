import TenantPolicyPage, { policyMetadata } from "@/components/ent/policy/TenantPolicyPage";

/** Any other configured policy kind (the admin setting `enterprise.policies.kinds`), served at `/policies/{slug}`; an unknown slug is the tenant 404. */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return policyMetadata((await params).slug);
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <TenantPolicyPage kind={(await params).slug} />;
}
