import TenantPolicyPage, { policyMetadata } from "@/components/ent/policy/TenantPolicyPage";

/** The organization's own policy page on its host (docs/enterprise-v2/62): the approved text, else the neutral template. Public (no sign-in first). */
export const generateMetadata = () => policyMetadata("ACCEPTABLE_USE");

export default function Page() {
  return <TenantPolicyPage kind="ACCEPTABLE_USE" />;
}
