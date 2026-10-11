import { CurvedArrow, HeartIcon, MailIcon } from "@kiwiply/ui";
import { Photo } from "../media";
import { AboutHeading, IconTile } from "./shared";

/** Tiny "Example" tag — every sample-data mock carries one (spec §4, mocks). */
function ExampleBadge() {
  return (
    <span className="rounded-full bg-v2-line px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-v2-muted">
      Example
    </span>
  );
}

/**
 * §8.3 — "Why we built Kiwiply" (#mission): team cutout + two small floating cards, copy, quote.
 * The cutout rests on the section's bottom edge on desktop (negative margin) and on the cards on
 * mobile; the cards float above the heads from sm up.
 */
export default function Mission() {
  return (
    <section id="mission" aria-labelledby="mission-title" className="scroll-mt-20 px-5 py-16 lg:px-8 lg:py-24">
      <div className="mx-auto grid max-w-[1200px] items-center gap-10 lg:grid-cols-2 lg:gap-14">
        {/* Visual: below the copy on mobile (spec 10: copy, then visual) */}
        <div className="relative order-2 flex flex-col sm:pt-[212px] lg:order-1 lg:-mb-24 lg:self-end">
          <Photo
            id="about-team"
            alt="Three colleagues smiling at their laptops together"
            className="order-1 mx-auto w-full max-w-[560px]"
            sizes="(min-width: 1024px) 560px, 100vw"
            edgeFade={[8, 4]}
          />
          <div aria-hidden className="absolute left-4 top-6 hidden items-start gap-1 sm:flex">
            <span className="-rotate-6 font-[family-name:var(--font-hand)] text-2xl leading-6 text-ink">
              From searching
              <br />
              to thriving
            </span>
            <CurvedArrow direction="down-right" className="mt-6 h-8 w-8 text-v2-green" />
          </div>

          <div
            className="order-2 mt-0 grid gap-3 rounded-b-[var(--radius-v2-card)] sm:absolute sm:right-4 sm:top-0 sm:mt-0 sm:w-[270px] lg:right-0"
            aria-label="Example application cards"
          >
            <div className="rounded-[var(--radius-v2-card)] bg-white p-4 shadow-v2-float">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-ink">Applications</p>
                <ExampleBadge />
              </div>
              <ul className="mt-2 grid gap-2 text-[13px]">
                <li className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-ink">Product Designer</span>
                  <span className="rounded-full bg-v2-blue-soft px-2 py-0.5 text-xs font-semibold text-ink">Applied</span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-ink">Data Analyst</span>
                  <span className="rounded-full bg-v2-lime-soft px-2 py-0.5 text-xs font-semibold text-ink">Interview</span>
                </li>
              </ul>
            </div>
            <div className="flex items-center gap-3 rounded-[var(--radius-v2-card)] bg-white p-3.5 shadow-v2-float">
              <IconTile family="green" className="h-10 w-10 rounded-xl">
                <MailIcon size={20} />
              </IconTile>
              <div className="min-w-0 text-[13px]">
                <p className="font-bold text-ink">New message</p>
                <p className="truncate text-ink-soft">Interview invitation &middot; Acme Robotics</p>
              </div>
            </div>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <AboutHeading id="mission-title" eyebrow="Our why" title="Why we built" accent="Kiwiply" />
          <div className="mt-5 grid gap-4 text-base leading-relaxed text-ink-soft md:text-lg">
            <p>
              Job searching is full of friction: too many tabs, the same form filled in again and again,
              and no clear idea where each application stands. It&rsquo;s easy to lose track, and easy to
              feel stuck.
            </p>
            <p>
              So we built one place for all of it. Kiwiply autofills applications from your profile and
              leaves every answer for you to review, tracks the replies that land in your Gmail, and keeps
              every application on a single board &mdash; you stay in charge of what gets sent.
            </p>
          </div>
          <figure className="mt-6 flex items-center gap-4 rounded-[var(--radius-v2-card)] bg-v2-blue-soft p-5">
            <HeartIcon size={32} aria-hidden className="flex-none text-v2-blue" />
            <blockquote className="text-base font-semibold text-ink md:text-lg">
              Because everyone deserves a fair shot at a career they&rsquo;re excited about.
            </blockquote>
          </figure>
        </div>
      </div>
    </section>
  );
}
