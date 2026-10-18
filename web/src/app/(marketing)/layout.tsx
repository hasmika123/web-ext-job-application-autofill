import { Caveat, Plus_Jakarta_Sans } from "next/font/google";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import ChromeGate from "@/components/marketing/ChromeGate";
import { hasSession } from "@/lib/auth";
import { serverApiFetch } from "@/lib/api";

// Landing v2 display + handwriting faces. The CSS variables are put on the wrapper below so
// they're scoped to the marketing group (the signed-in app keeps Fraunces/Inter).
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

type MarketingAccount = { login?: string; email?: string; firstName?: string; lastName?: string };

function initialFor(a?: MarketingAccount | null): string {
  const src = a?.firstName || a?.login || a?.email || "?";
  return src.charAt(0).toUpperCase();
}

/**
 * Marketing shell for public pages (`/`, `/privacy`, `/terms`, …). The whole group is wrapped
 * in `.theme-v2` ("Kiwiply Bright", packages/ui/styles/theme-v2.css), which re-skins the shared
 * tokens for these routes only. No session gate: when the visitor is already signed in, the
 * header swaps Log in / Get Started for a Dashboard button + account avatar (→ Settings), so the
 * logo can safely bring signed-in users back here. Authed app routes use `(app)`. Routes with
 * their own chrome (`/v3`) opt out via `ChromeGate`.
 */
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const authed = await hasSession();
  let account: MarketingAccount | null = null;
  if (authed) {
    try {
      const res = await serverApiFetch("/api/account");
      if (res.ok) account = (await res.json().catch(() => null)) as MarketingAccount | null;
    } catch {
      /* stale/expired cookie — still show Dashboard, just without an initial */
    }
  }
  return (
    <div className={`theme-v2 ${jakarta.variable} ${caveat.variable} flex flex-1 flex-col`}>
      <ChromeGate>
        <MarketingHeader authed={authed} initial={initialFor(account)} />
      </ChromeGate>
      <div className="flex-1">{children}</div>
      <ChromeGate>
        <MarketingFooter />
      </ChromeGate>
    </div>
  );
}
