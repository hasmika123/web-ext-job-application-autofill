"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StarIcon, cn } from "@kiwiply/ui";
import type { V3Story } from "./placeholder-data";

const AVATAR_TINTS = [
  "bg-v2-pink-soft text-[#B72A80]",
  "bg-v2-blue-soft text-[#1A5BD6]",
  "bg-v2-violet-soft text-[#5B3FE0]",
  "bg-v2-amber-soft text-[#9A5B00]",
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
 * "Real stories, real progress." carousel (phone board): a scroll-snap row with one card per view
 * on phones (two from md, three from lg) and a row of round dots under it. Dots follow the scroll
 * position and jump to a card when pressed. No auto-advance.
 */
export default function V3StoryCarousel({ items }: { items: V3Story[] }) {
  const track = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);

  const update = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const card = el.querySelector("li");
    if (!card) return;
    const step = card.getBoundingClientRect().width + 20;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    setActive(atEnd && el.scrollLeft > 0 ? items.length - 1 : Math.round(el.scrollLeft / step));
  }, [items.length]);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [update]);

  function goTo(i: number) {
    const el = track.current;
    const card = el?.querySelectorAll("li")[i];
    if (!el || !card) return;
    el.scrollTo({ left: (card as HTMLElement).offsetLeft - el.offsetLeft, behavior: "smooth" });
  }

  return (
    <div>
      <ul
        ref={track}
        aria-label="Success stories"
        className="-my-8 flex snap-x snap-mandatory gap-5 overflow-x-auto py-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((t, i) => (
          <li key={t.name} className="w-full flex-none snap-start md:w-[calc((100%-1.25rem)/2)] lg:w-[calc((100%-2.5rem)/3)]">
            <figure className="flex h-full flex-col gap-3 rounded-[20px] border border-v2-line/50 bg-white p-5 shadow-v2-card">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className={cn("grid h-12 w-12 flex-none place-items-center rounded-full text-[16px] font-bold", AVATAR_TINTS[i % AVATAR_TINTS.length])}
                >
                  {initials(t.name)}
                </span>
                <figcaption className="min-w-0">
                  <span className="block text-[15px] font-bold leading-tight text-v2-navy">{t.name}</span>
                  <span className="block text-[12.5px] text-v2-muted">{t.role}</span>
                  <span role="img" aria-label="5 out of 5 stars" className="mt-1 flex gap-0.5 text-v2-amber">
                    {Array.from({ length: 5 }, (_, s) => (
                      <StarIcon key={s} size={14} fill="currentColor" aria-hidden />
                    ))}
                  </span>
                </figcaption>
              </div>
              <blockquote className="text-[15px] leading-relaxed text-v2-ink-soft">&ldquo;{t.quote}&rdquo;</blockquote>
            </figure>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-center" role="group" aria-label="Choose a story">
        {items.map((t, i) => (
          <button
            key={t.name}
            type="button"
            aria-label={`Show story ${i + 1} of ${items.length}`}
            aria-current={i === active}
            onClick={() => goTo(i)}
            className="grid h-11 w-11 cursor-pointer place-items-center"
          >
            <span className={cn("block h-3 w-3 rounded-full transition-colors", i === active ? "bg-v2-lime-deep" : "bg-v2-line")} />
          </button>
        ))}
      </div>
    </div>
  );
}
