"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, StarIcon, cn } from "@kiwiply/ui";
import type { Testimonial } from "../placeholder-data";

const AVATAR_TINTS = [
  "bg-v2-pink-soft text-[#B72A80]",
  "bg-v2-blue-soft text-[#1A5BD6]",
  "bg-v2-violet-soft text-[#5B3FE0]",
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Success-stories carousel: a scroll-snap row (three cards fit from lg; one-and-a-bit on a phone)
 * with round previous / next buttons that scroll by one card. The buttons disable themselves when
 * there is nothing further to scroll to (all three cards fit on a wide screen).
 */
export default function TestimonialCarousel({ items }: { items: Testimonial[] }) {
  const track = useRef<HTMLUListElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const update = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [update]);

  function step(dir: 1 | -1) {
    const el = track.current;
    if (!el) return;
    const card = el.querySelector("li");
    const w = card ? card.getBoundingClientRect().width + 20 : el.clientWidth;
    el.scrollBy({ left: dir * w, behavior: "smooth" });
  }

  const btn =
    "grid h-10 w-10 flex-none place-items-center rounded-full bg-white text-v2-blue shadow-v2-card transition-opacity hover:bg-v2-blue-soft disabled:opacity-40 disabled:hover:bg-white";

  return (
    <div className="flex items-center gap-3">
      <button type="button" aria-label="Previous stories" onClick={() => step(-1)} disabled={!canPrev} className={cn(btn, "hidden sm:grid")}>
        <ChevronLeftIcon size={18} />
      </button>
      <ul
        ref={track}
        className="flex min-w-0 flex-1 snap-x snap-mandatory -my-10 gap-5 overflow-x-auto py-12 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((t, i) => (
          <li key={t.name} className="w-[82%] flex-none snap-start sm:w-[calc((100%-1.25rem)/2)] lg:w-[calc((100%-2.5rem)/3)]">
            <figure className="flex h-full gap-4 rounded-[var(--radius-v2-card)] border border-v2-line/50 bg-white p-5 shadow-v2-card">
              <span
                aria-hidden
                className={cn(
                  "grid h-14 w-14 flex-none place-items-center rounded-full text-[17px] font-bold",
                  AVATAR_TINTS[i % AVATAR_TINTS.length],
                )}
              >
                {initials(t.name)}
              </span>
              <div className="flex min-w-0 flex-col gap-3">
                <blockquote className="text-[14.5px] leading-relaxed text-v2-navy">&ldquo;{t.quote}&rdquo;</blockquote>
                <figcaption>
                  <span className="block text-[14.5px] font-bold leading-tight text-v2-navy">{t.name}</span>
                  <span className="block text-[12.5px] text-v2-muted">{t.role}</span>
                  <span role="img" aria-label="5 out of 5 stars" className="mt-2 flex gap-0.5 text-v2-amber">
                    {Array.from({ length: 5 }, (_, s) => (
                      <StarIcon key={s} size={16} fill="currentColor" aria-hidden />
                    ))}
                  </span>
                </figcaption>
              </div>
            </figure>
          </li>
        ))}
      </ul>
      <button type="button" aria-label="Next stories" onClick={() => step(1)} disabled={!canNext} className={cn(btn, "hidden sm:grid")}>
        <ChevronRightIcon size={18} />
      </button>
    </div>
  );
}
