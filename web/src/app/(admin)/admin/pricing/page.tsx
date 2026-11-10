import { redirect } from "next/navigation";

/** /admin/pricing opens its first tab, Plans (the other tabs of the pricing console are a later story). */
export default function AdminPricingPage() {
  redirect("/admin/pricing/plans");
}
