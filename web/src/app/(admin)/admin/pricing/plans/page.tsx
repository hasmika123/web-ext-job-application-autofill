import type { Metadata } from "next";
import PlansPage from "@/components/admin-v3/pricing/PlansPage";

export const metadata: Metadata = {
  title: "Plans · Pricing · Admin",
  robots: { index: false, follow: false },
};

/** The platform admin plans list (K4.1). The table reads its own rows through the BFF (`/api/admin/plans`). */
export default function AdminPlansPage() {
  return <PlansPage />;
}
