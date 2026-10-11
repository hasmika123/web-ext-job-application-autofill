import type { Metadata } from "next";
import SecurityPage from "@/components/admin-v3/security/SecurityPage";

export const metadata: Metadata = {
  title: "Security · Admin · Kiwiply",
  robots: { index: false, follow: false },
};

export default function AdminSecurityPage() {
  return <SecurityPage />;
}
