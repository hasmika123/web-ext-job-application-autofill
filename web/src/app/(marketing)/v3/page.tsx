import type { Metadata } from "next";
import { hasSession } from "@/lib/auth";
import { serverApiFetch } from "@/lib/api";
import V3Apply from "@/components/marketing/v3/V3Apply";
import { V3AppTiles, V3CompaniesStrip } from "@/components/marketing/v3/V3Companies";
import V3CtaBand from "@/components/marketing/v3/V3CtaBand";
import V3Faq from "@/components/marketing/v3/V3Faq";
import V3Footer from "@/components/marketing/v3/V3Footer";
import V3Header from "@/components/marketing/v3/V3Header";
import V3Hero from "@/components/marketing/v3/V3Hero";
import V3Individuals from "@/components/marketing/v3/V3Individuals";
import V3Organizations from "@/components/marketing/v3/V3Organizations";
import V3Pillars from "@/components/marketing/v3/V3Pillars";
import V3Platform from "@/components/marketing/v3/V3Platform";
import V3Results from "@/components/marketing/v3/V3Results";
import V3StatsBand from "@/components/marketing/v3/V3StatsBand";
import V3Steps from "@/components/marketing/v3/V3Steps";
import V3Stories from "@/components/marketing/v3/V3Stories";

export const metadata: Metadata = {
  title: "From Resume to Dream Job",
  description:
    "Create standout resumes, find the right opportunities, apply faster and prepare for interviews with Kiwiply, all in one place.",
  // Alternate landing under review; `/` stays the canonical landing page.
  robots: { index: false, follow: true },
};

/**
 * The shared `(marketing)` layout renders `MarketingHeader` and `MarketingFooter` around every
 * page and has no per-route switch, so this page hides them with CSS: the layout's wrapper
 * (`.theme-v2`) loses its direct-child `header` / `footer` whenever it contains `[data-v3-page]`.
 * Only the layout's own direct children match; the v3 header and footer rendered below are nested
 * deeper and are unaffected. (Browsers without `:has()` would show both; the layout is untouched.)
 */
const HIDE_SHARED_CHROME = `.theme-v2:has([data-v3-page]) > header, .theme-v2:has([data-v3-page]) > footer { display: none; }`;

type Account = { login?: string; email?: string; firstName?: string };

/**
 * Landing v3 (spec web/APP-V2-SPEC.md section 7, boards design/app-v2/landing-v3-*.webp). Desktop
 * first screen: hero, companies strip, six pillars, stats band, "Get Hired in 4 Simple Steps".
 * Then, in the phone board's order: one platform (phone mock), apply with AI, for individuals,
 * for organizations, real stories, results, dark CTA band, FAQ, dark footer.
 */
export default async function LandingV3() {
  const authed = await hasSession();
  let initial = "?";
  if (authed) {
    try {
      const res = await serverApiFetch("/api/account");
      if (res.ok) {
        const a = (await res.json().catch(() => null)) as Account | null;
        initial = (a?.firstName || a?.login || a?.email || "?").charAt(0).toUpperCase();
      }
    } catch {
      /* stale cookie: keep the Dashboard button, no initial */
    }
  }

  return (
    <div data-v3-page className="overflow-x-clip bg-v2-canvas">
      <style>{HIDE_SHARED_CHROME}</style>
      <V3Header authed={authed} initial={initial} />
      <main>
        <V3Hero />
        <V3AppTiles />
        <V3CompaniesStrip className="-mt-2" />
        <V3Pillars />
        <V3StatsBand />
        <V3Steps />
        <V3Platform />
        <V3Apply />
        <V3Individuals />
        <V3Organizations />
        <V3Stories />
        <V3Results />
        <V3CtaBand />
        <V3Faq />
      </main>
      <V3Footer />
    </div>
  );
}
