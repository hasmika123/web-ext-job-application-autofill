import { redirect } from "next/navigation";
import { Caveat, Plus_Jakarta_Sans } from "next/font/google";
import { hasSession } from "@/lib/auth";
import { serverApiFetch } from "@/lib/api";
import AppShell, { type AppAccount } from "@/components/app-shell/AppShell";
import { getPlan } from "@/lib/billing";
import { SamplesProvider } from "@/components/app-v3/SamplesProvider";
import { getPublicConfig } from "@/lib/public-config";
import RetirementBanner from "@/components/billing/RetirementBanner";

// App v2 display + handwriting faces (same as the marketing group). The CSS variables go on the
// `.theme-v2` wrapper below so they are scoped to the signed-in app.
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
 * Shell for all authed app routes (dashboard/profile/resumes/board/settings).
 * Gates the session ONCE here (replacing the per-page `hasSession()` checks) and
 * renders the persistent sidebar + mobile drawer. The account is fetched for the
 * sidebar user chip; individual pages still fetch their own data.
 *
 * Gating is two-stage so a protected page is never reachable without a *valid* login:
 *   1. No session cookie at all → redirect immediately (cheap, skips the API call).
 *   2. Cookie present but the token is rejected by the API (forged, tampered, or — the
 *      common case — the access token expired while the 30-day cookie lingers) → the
 *      `/api/account` probe returns 401, so we redirect rather than render the shell.
 * A non-401 failure (server down, network) is left to error normally — it must NOT be
 * treated as "signed out", and it still doesn't leak data (the shell renders empty).
 */
export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
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

  // Fetched ONCE here rather than per component: every gated surface would otherwise add a
  // round-trip on each page load. getPlan() never throws — a billing outage must not blank the app.
  const plan = await getPlan();
  // The org feature flag (E2E-O1.9): cached 5 minutes, fails closed. While it is off there is no org entry in the menu.
  const { orgs } = await getPublicConfig();

  // "Kiwiply Bright" (APP-V2-SPEC section 1.5): the whole signed-in app lives under `.theme-v2`.
  return (
    <div className={`theme-v2 ${jakarta.variable} ${caveat.variable} flex flex-1 flex-col`}>
      <SamplesProvider login={account?.login}>
        <AppShell account={account} isPro={plan.plan === "PRO"} orgsEnabled={orgs}>
          {plan.retirement || plan.lock ? (
            <div className="mb-4">
              <RetirementBanner retirement={plan.retirement} lock={plan.lock} />
            </div>
          ) : null}
          {children}
        </AppShell>
      </SamplesProvider>
    </div>
  );
}
