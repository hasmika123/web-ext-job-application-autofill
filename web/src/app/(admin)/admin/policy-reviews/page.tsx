import type { Metadata } from "next";
import PolicyReviewsPage from "@/components/admin-v3/policy-reviews/PolicyReviewsPage";

export const metadata: Metadata = {
  title: "Policy reviews · Admin",
  robots: { index: false, follow: false },
};

/** The platform admin's queue of organization policies waiting to be published (docs/enterprise-v2/62). Platform host only, like every /admin page. */
export default function AdminPolicyReviewsPage() {
  return <PolicyReviewsPage />;
}
