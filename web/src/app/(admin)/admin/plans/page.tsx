import { redirect } from "next/navigation";

/** Short link: /admin/plans is the plans list at its canonical address. */
export default function AdminPlansShortLink() {
  redirect("/admin/pricing/plans");
}
