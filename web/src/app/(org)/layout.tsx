import { redirect } from "next/navigation";
import { Caveat, Plus_Jakarta_Sans } from "next/font/google";
import { hasSession } from "@/lib/auth";
import { serverApiFetch } from "@/lib/api";
import OrgShell from "@/components/org-v2/shell/OrgShell";
import type { AppAccount } from "@/components/app-shell/AppShell";

// Same display + handwriting faces as the marketing group; the CSS variables live on the wrapper
// below so they only reach the `/org` routes.
const jakarta = Plus_Jakarta_Sans({
  weight: ["700", "800"],
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const caveat = Caveat({
  weight: "600",
  subsets: ["latin"],
  variable: "--font-caveat",
  display: "swap",
});

/**
 * Shell for the enterprise admin area (`/org/*`, APP-V2-SPEC section 5).
 *
 * NOTE: no organization model exists in the API yet, so ANY signed-in user can open `/org` on this
 * branch, and every number on the pages is sample data (`components/org-v2/sample-data.ts`).
 * When orgs ship, gate here on membership/role instead of just a session.
 *
 * The session gate mirrors `(app)/layout.tsx`: no cookie -> /login; a 401/403 from the account
 * probe (expired or forged token) -> /login; any other failure just renders the shell without a
 * name rather than treating the user as signed out.
 */
export default async function OrgGroupLayout({ children }: { children: React.ReactNode }) {
  if (!(await hasSession())) {
    redirect("/login");
  }

  let account: AppAccount | null = null;
  const res = await serverApiFetch("/api/account");
  if (res.status === 401 || res.status === 403) {
    redirect("/login");
  }
  if (res.ok) {
    account = (await res.json().catch(() => null)) as AppAccount | null;
  }

  return (
    <div className={`theme-v2 ${jakarta.variable} ${caveat.variable} flex flex-1 flex-col`}>
      <OrgShell account={account}>{children}</OrgShell>
    </div>
  );
}
