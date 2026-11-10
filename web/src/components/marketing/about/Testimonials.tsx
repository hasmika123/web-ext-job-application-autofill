import { StarIcon } from "@kiwiply/ui";
import Section from "../Section";
import { ABOUT_TESTIMONIALS } from "./placeholder-data";
import { RowHeading } from "./shared";

const AVATAR_TINTS = ["bg-v2-pink-soft text-[#B72A80]", "bg-v2-blue-soft text-[#1A5BD6]", "bg-v2-violet-soft text-[#5B3FE0]"];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** "Real stories. Brighter futures." Three quote cards: initial avatar, name, role, five stars. */
export default function Testimonials() {
  if (ABOUT_TESTIMONIALS.length === 0) return null;
  return (
    <Section labelledBy="stories-title" className="py-10 lg:py-14">
      <RowHeading id="stories-title" eyebrow="People Love Kiwiply" title="Real stories. Brighter futures." />
      <ul className="mt-8 grid gap-4 md:grid-cols-3 md:gap-3 lg:mt-10 lg:gap-5">
        {ABOUT_TESTIMONIALS.map((t, i) => (
          <li key={t.name}>
            <figure className="flex h-full flex-col justify-between gap-5 rounded-[var(--radius-v2-card)] bg-white p-5 shadow-v2-card lg:p-6">
              <blockquote className="text-[15px] italic leading-relaxed text-v2-ink-soft">
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <figcaption className="flex items-center gap-3 md:max-xl:flex-wrap">
                <span
                  aria-hidden
                  className={`grid h-12 w-12 flex-none place-items-center rounded-full text-[15px] font-bold ${AVATAR_TINTS[i % AVATAR_TINTS.length]}`}
                >
                  {initials(t.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold leading-tight text-v2-navy">{t.name}</span>
                  <span className="block text-[13px] text-v2-muted">{t.role}</span>
                </span>
                <span role="img" aria-label="5 out of 5 stars" className="flex flex-none gap-0.5 text-v2-amber md:max-xl:order-last md:max-xl:w-full">
                  {Array.from({ length: 5 }, (_, s) => (
                    <StarIcon key={s} size={15} fill="currentColor" aria-hidden />
                  ))}
                </span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </Section>
  );
}
