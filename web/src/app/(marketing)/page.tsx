import Link from "next/link";
import { Tag } from "@/components/ui";
import { buttonVariants } from "@/components/ui/Button";

/**
 * Marketing landing (R2.1). Full rebuild on the kiwi system: charcoal hero + product-
 * peek, how-it-works, features, and a pricing teaser (Free live / Pro "coming soon" per
 * the locked decision). Header + footer come from the `(marketing)` layout. Presentation
 * only — the CTAs route to the existing /signup + /login.
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

const FEATURES = [
  { icon: "🗂️", title: "One profile, every form", body: "Map your details once to a canonical field model that adapts to Workday, Greenhouse, Lever, Ashby, Workable and more." },
  { icon: "📄", title: "Resume variants, parsed", body: "Keep multiple tailored resumes. Kiwiply remembers which one you sent to each job." },
  { icon: "🤖", title: "AI answer drafting", body: "Open-ended questions get a draft you can edit — free with Kiwiply AI, or bring your own key for unlimited." },
  { icon: "📊", title: "Self-populating tracker", body: "A board that logs applications automatically and nudges you to confirm what you actually submitted." },
];

const FREE_FEATURES = ["Unlimited autofill", "Resume variants, parsed", "Self-populating tracker", "Bring-your-own AI key"];
const PRO_FEATURES = ["Everything in Free", "Kiwiply AI drafts included", "Field-answer memory, synced", "Priority ATS support"];

function Check() {
  return (
    <span className="grid h-4 w-4 flex-none place-items-center rounded-[5px] bg-accent text-[10px] font-bold text-on-accent">✓</span>
  );
}

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section
        className="relative overflow-hidden"
        style={{ background: "var(--hero-bg)", color: "var(--hero-ink)" }}
      >
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 md:grid-cols-[1.05fr_.95fr] lg:py-[74px]">
          <div>
            <Tag>Job applications, on autopilot</Tag>
            <h1 className="mt-[18px] text-[33px] font-semibold leading-[1.03] text-hero-ink sm:text-5xl lg:text-[52px]">
              Apply once.
              <br />
              Reuse everywhere.
            </h1>
            <p className="mt-5 max-w-[520px] text-lg leading-relaxed text-hero-ink/80">
              Build one profile, manage your resumes, and let the Kiwiply browser extension fill
              applications for you — right on the page. Every job you touch lands on a tracker that
              fills itself.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3.5">
              <Link href="/signup" className={buttonVariants("accent")}>
                Add to Chrome — it&apos;s free
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-hero-ink/30 px-5 py-[11px] text-sm font-semibold leading-none text-hero-ink transition hover:bg-white/5 active:translate-y-px"
              >
                See the dashboard →
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-[18px] gap-y-2 text-[13px] text-hero-ink/65">
              <span><b className="text-hero-ink">No auto-submit.</b> You review every field.</span>
              <span><b className="text-hero-ink">Your data, yours.</b> Delete anytime.</span>
              <span>Workday · Greenhouse · Lever · Ashby <b className="text-hero-ink">+ more</b></span>
            </div>
          </div>

          {/* Product peek — the review-autofill overlay */}
          <div className="rounded-2xl bg-paper p-3.5 text-ink shadow-[var(--shadow-lg)]">
            <div className="flex items-center gap-1.5 px-1.5 pb-3 pt-1">
              <span className="h-[9px] w-[9px] rounded-full bg-line" />
              <span className="h-[9px] w-[9px] rounded-full bg-line" />
              <span className="h-[9px] w-[9px] rounded-full bg-line" />
              <span className="ml-2 text-[11px] font-bold uppercase tracking-[.1em] text-muted">
                Review autofill · Workday
              </span>
            </div>
            {[
              { f: "First name", v: <>Hasmika</> },
              { f: "Email", v: <>hasmika@example.com</> },
              {
                f: "Why this role?",
                v: (
                  <>
                    I&apos;m drawn to…{" "}
                    <span className="ml-1 rounded bg-accent px-1.5 py-px text-[8.5px] font-extrabold tracking-[.06em] text-on-accent">
                      AI
                    </span>
                  </>
                ),
              },
              { f: "Résumé", v: <>hasmika_pm_2026.pdf</> },
            ].map((row, i) => (
              <div key={i} className="mb-[7px] flex items-center gap-2.5 rounded-[10px] bg-paper-2 p-2.5 text-[12.5px]">
                <Check />
                <span className="w-24 flex-none text-muted">{row.f}</span>
                <span className="min-w-0 truncate font-semibold text-ink">{row.v}</span>
              </div>
            ))}
            <div className="mt-1.5 flex justify-end gap-2">
              <span className="rounded-lg border border-line px-3 py-2 text-xs font-bold text-ink-soft">Cancel</span>
              <span className="rounded-lg bg-ink px-3 py-2 text-xs font-bold text-paper">Fill selected</span>
            </div>
          </div>
        </div>
      </section>

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
              <div className="mb-2.5 text-[22px]">{f.icon}</div>
              <h3 className="mb-1.5 font-display text-[18px] font-semibold text-ink">{f.title}</h3>
              <p className="text-[13.5px] leading-relaxed text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing teaser — Free live / Pro coming soon (locked decision) */}
      <section id="pricing" className="mx-auto max-w-6xl px-6 pb-[84px]">
        <h2 className="text-center text-[27px] font-semibold text-ink sm:text-[34px]">
          Start free. Pro is on the way.
        </h2>
        <p className="mx-auto mb-10 mt-2 max-w-[560px] text-center text-base text-muted">
          Bring your own AI key on any plan for unlimited drafting at no cost.
        </p>
        <div className="mx-auto grid max-w-3xl gap-[18px] sm:grid-cols-2">
          {/* Free */}
          <div className="flex flex-col rounded-[var(--radius-lg)] border-2 border-accent bg-paper p-7 shadow-[var(--shadow)]">
            <h3 className="text-xl font-semibold text-ink">Free</h3>
            <div className="my-2.5 font-display text-[40px] font-bold text-ink">
              $0<span className="text-[15px] font-medium text-muted">/forever</span>
            </div>
            <ul className="my-4 flex flex-col gap-2.5">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex gap-2.5 text-[13.5px] text-ink-soft">
                  <span className="font-extrabold text-accent-deep">✓</span> {f}
                </li>
              ))}
            </ul>
            <Link href="/signup" className={buttonVariants("accent") + " mt-auto"}>
              Get started
            </Link>
          </div>

          {/* Pro — coming soon */}
          <div className="flex flex-col rounded-[var(--radius-lg)] border border-line bg-paper p-7 shadow-[var(--shadow)]">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-semibold text-ink">Pro</h3>
              <span className="rounded-full bg-brown-soft px-2.5 py-1 text-[11px] font-bold text-brown-deep">
                Coming soon
              </span>
            </div>
            <div className="my-2.5 font-display text-[40px] font-bold text-muted">
              —<span className="text-[15px] font-medium text-muted"> /mo</span>
            </div>
            <ul className="my-4 flex flex-col gap-2.5">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex gap-2.5 text-[13.5px] text-muted">
                  <span className="font-extrabold text-brown">✓</span> {f}
                </li>
              ))}
            </ul>
            <span className={buttonVariants("ghost") + " mt-auto cursor-default opacity-60"} aria-disabled>
              Notify me at launch
            </span>
          </div>
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          <Link href="/pricing" className="font-semibold text-accent-deep hover:underline">
            See full pricing →
          </Link>
        </p>
      </section>
    </>
  );
}
