import { AiIcon, BoardIcon, FileTextIcon, UserIcon } from "@kiwiply/ui";
import HeroArt from "@/components/marketing/HeroArt";
import HeroCarousel from "@/components/marketing/HeroCarousel";
import { HERO_SLIDES } from "@/components/marketing/hero-slides";
import TrustStrip from "@/components/marketing/TrustStrip";
import { PricingSection, ServicesSection } from "@/components/pricing/PricingSections";
import { hasSession } from "@/lib/auth";
import { getPlan } from "@/lib/billing";

/**
 * Marketing landing (R2.1; hero replaced by the v2 carousel in V2.2). Hero carousel + ATS trust
 * strip, how-it-works, features, then the full Pricing and Services sections (every plan and
 * service, each with a details pop-up — there is no separate pricing page). Header + footer come from the `(marketing)` layout. The visitor's plan is
 * read only to label Pro's button (already on Pro / payments not open yet / checkout).
 */

const STEPS = [
  {
    n: 1,
    title: "Build your profile",
    body: "Upload a resume and Kiwiply parses it into a reusable profile — contact details, work history, skills, and answers.",
  },
  {
    n: 2,
    title: "Fill any application",
    body: "On a live job form, the extension scans the page and shows you exactly what it'll fill. Review, uncheck anything, then fill.",
  },
  {
    n: 3,
    title: "Watch the board fill itself",
    body: "Every fill becomes a tracked application — draft on fill, confirmed on submit. No spreadsheet, no copy-paste.",
  },
];

// Icons come from the shared set (@kiwiply/ui), never emoji — same look on every OS.
const FEATURES = [
  { icon: UserIcon, title: "One profile, every form", body: "Map your details once to a canonical field model that adapts to Workday, Greenhouse, Lever, Ashby, Workable and more." },
  { icon: FileTextIcon, title: "Resume variants, parsed", body: "Keep multiple tailored resumes. Kiwiply remembers which one you sent to each job." },
  { icon: AiIcon, title: "AI answer drafting", body: "Open-ended questions get a draft you can edit — with Kiwiply AI on Pro, or with your own AI key on Free." },
  { icon: BoardIcon, title: "Self-populating tracker", body: "A board that logs applications automatically and nudges you to confirm what you actually submitted." },
];

export default async function Home() {
  const signedIn = await hasSession();
  // Only meaningful when signed in; a signed-out visitor gets the defaults (Free, no billing).
  const plan = signedIn ? await getPlan() : null;
  const alreadyPro = plan?.plan === "PRO";
  const billingLive = plan?.billingEnabled ?? false;

  return (
    <>
      {/* Hero carousel (V2.2) + trust strip. Slide art is rendered here on the server (Photo and
          Mascot read the filesystem) and handed to the client carousel as nodes. */}
      <HeroCarousel
        slides={HERO_SLIDES.map((slide, i) => ({
          id: slide.id,
          title: slide.title,
          eyebrow: slide.eyebrow,
          family: slide.family,
          headline: slide.headline,
          lede: slide.lede,
          ticks: slide.ticks,
          cta: slide.cta,
          art: <HeroArt slide={slide} priority={i === 0} />,
        }))}
      />
      <TrustStrip />

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl px-6 py-[70px]">
        <h2 className="text-center text-[27px] font-semibold text-ink sm:text-[34px]">
          From blank form to submitted in three steps
        </h2>
        <p className="mx-auto mb-10 mt-2 max-w-[560px] text-center text-base text-muted">
          Set up your profile once. After that, applying is a click — and everything you apply to
          tracks itself.
        </p>
        <div className="grid gap-5 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-[var(--radius-lg)] border border-line bg-paper p-[26px] shadow-[var(--shadow)]">
              <div className="mb-3.5 grid h-[34px] w-[34px] place-items-center rounded-[10px] bg-accent-soft font-display text-base font-bold text-accent-deep">
                {s.n}
              </div>
              <h3 className="mb-2 font-display text-[19px] font-semibold text-ink">{s.title}</h3>
              <p className="text-sm leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 pb-[70px]">
        <h2 className="text-center text-[27px] font-semibold text-ink sm:text-[34px]">
          Everything you need to apply faster
        </h2>
        <p className="mx-auto mb-10 mt-2 max-w-[560px] text-center text-base text-muted">
          A web app for managing your search, plus an on-page agent that does the typing.
        </p>
        <div className="grid gap-[18px] sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-[var(--radius-lg)] border border-line bg-paper p-6 shadow-[var(--shadow)]">
              <div className="mb-3.5 grid h-[38px] w-[38px] place-items-center rounded-[10px] bg-accent-soft text-accent-deep">
                <f.icon className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="mb-1.5 font-display text-[18px] font-semibold text-ink">{f.title}</h3>
              <p className="text-[13.5px] leading-relaxed text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing (Free · Pro · Autopilot · Consultancy) and Services — each card opens a pop-up with
          the full breakdown. This replaced the separate /pricing page, which now redirects here. */}
      <PricingSection signedIn={signedIn} alreadyPro={alreadyPro} billingLive={billingLive} />
      <ServicesSection />
    </>
  );
}
