import { redirect } from "next/navigation";
import { hasSession } from "@/lib/auth";
import { serverApiFetch } from "@/lib/api";

/**
 * TEMP — replaced by C1's shell (`org1:`). Only gates the session exactly like `(app)/layout.tsx`
 * (no org model exists yet; any signed-in user can open /org on this branch) and wraps the
 * children in `.theme-v2` so the C2 pages compile and render. C1's layout supersedes this file.
 */
export default async function OrgGroupLayout({ children }: { children: React.ReactNode }) {
  if (!(await hasSession())) {
    redirect("/login");
  }
  const res = await serverApiFetch("/api/account");
  if (res.status === 401 || res.status === 403) {
    redirect("/login");
  }
  return (
    <div className="theme-v2 min-h-screen">
      <div className="mx-auto max-w-[1280px] p-4 sm:p-6">{children}</div>
    </div>
  );
}
