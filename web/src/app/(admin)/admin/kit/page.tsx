import type { Metadata } from "next";
import { notFound } from "next/navigation";
import KitPreview from "@/components/admin-v3/kit/KitPreview";

export const metadata: Metadata = {
  title: "Admin kit · Admin",
  robots: { index: false, follow: false },
};

/**
 * A specimen of the admin page kit (E2E-A15.0): development and the Playwright journeys only. A production build answers
 * 404, so the route never exists for a real operator; the admin layout above still gates it to ROLE_ADMIN.
 */
export default function AdminKitPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <KitPreview />;
}
