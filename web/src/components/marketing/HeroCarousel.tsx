"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ArrowRightIcon, CheckCircleIcon, ChevronLeftIcon, ChevronRightIcon, PlayIcon, cn } from "@kiwiply/ui";
import { buttonVariants } from "@/components/ui/Button";
import { DEMO_VIDEO_URL } from "@/lib/site";
import Eyebrow from "./Eyebrow";
import { FAMILY, type Family } from "./family";

/**
 * Hero carousel (spec section 6). Four audience slides on a translateX track.
 *
 * Client component, but it never imports `media.tsx` (that reads the filesystem): the server page
 * renders each slide's art (`HeroArt`) and passes it in as the `art` node, alongside the plain,
 * serialisable copy. Behaviour: 7s autoplay that pauses on hover / keyboard focus-within / hidden
 * tab and is off under prefers-reduced-motion; dots, arrows (md+), Left/Right keys when the region
 * has focus, touch/pen swipe (40px); inactive slides are `aria-hidden` + `inert`; a polite live
 * region announces the slide on change. All slides sit in one flex row, so the row is as tall as
 * the tallest slide and nothing shifts when the slide changes.
 */

export interface HeroSlideView {
  id: string;
  /** Short name for the dot label and the live announcer ("Autopilot"). */
  title: string;
  eyebrow: string;
  family: Family;
  headline: [string, string, string];
  lede: string;
  ticks: string[];
  cta: { href: string; label: string };
  /** Server-rendered art side (photo, mascot, floating cards, doodles). */
  art: ReactNode;
}

const AUTOPLAY_MS = 7000;
const SWIPE_PX = 40;

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const getReducedMotion = () => window.matchMedia(REDUCED_QUERY).matches;

function subscribeVisibility(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}
const getHidden = () => document.hidden;

export default function HeroCarousel({ slides }: { slides: HeroSlideView[] }) {
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);
  const tabHidden = useSyncExternalStore(subscribeVisibility, getHidden, () => false);

  const paused = hovering || focused || tabHidden || reducedMotion;

  const go = useCallback((i: number) => setIndex(((i % count) + count) % count), [count]);

  // One timeout per (index, paused) pair: any manual move or resume restarts the 7s clock.
  useEffect(() => {
    if (paused) return;
    const t = window.setTimeout(() => setIndex((i) => (i + 1) % count), AUTOPLAY_MS);
    return () => window.clearTimeout(t);
  }, [paused, index, count]);

  function onKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(index - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(index + 1);
    }
  }

  // Swipe: touch / pen only (mouse drags would fight text selection). A horizontal move of at
  // least 40px that is mostly horizontal changes slide; the click that follows is swallowed.
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse") return;
    start.current = { x: e.clientX, y: e.clientY };
    swiped.current = false;
  }
  function onPointerUp(e: React.PointerEvent) {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
      swiped.current = true;
      go(index + (dx < 0 ? 1 : -1));
    }
  }

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Kiwiply highlights"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      onFocus={(e) => {
        // Keyboard focus pauses; a mouse click that merely focuses a dot must not freeze autoplay.
        if (e.target.matches(":focus-visible")) setFocused(true);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      className="relative isolate overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-v2-navy/40"
    >
      {/* Two soft radial blobs behind the hero (spec 2.4): lime top-left, sky-blue top-right. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 -top-40 -z-10 h-[520px] w-[520px] rounded-full opacity-40 [background:radial-gradient(closest-side,#84E33D,transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 -top-32 -z-10 h-[560px] w-[560px] rounded-full opacity-40 [background:radial-gradient(closest-side,#9CD2FF,transparent)]"
      />

      <div
        className="touch-pan-y overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (start.current = null)}
        onClickCapture={(e) => {
          if (swiped.current) {
            swiped.current = false;
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        <div
          className="flex transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {slides.map((s, i) => {
            const active = i === index;
            const f = FAMILY[s.family];
            const Heading = i === 0 ? "h1" : "h2";
            return (
              <div
                key={s.id}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${count}: ${s.title}`}
                aria-hidden={!active}
                inert={!active}
                className="w-full flex-none lg:min-h-[640px]"
              >
                <div className="mx-auto grid max-w-6xl gap-8 px-5 pt-8 md:px-6 md:pt-10 lg:grid-cols-[1fr_1.1fr] lg:gap-6 lg:pt-12">
                  <div className="min-w-0 lg:self-center lg:pb-10">
                    <Eyebrow family={s.family}>{s.eyebrow}</Eyebrow>
                    <Heading className="mt-5 text-[36px] text-v2-navy md:text-[44px] lg:text-[56px] xl:text-[60px]">
                      <span className="block">{s.headline[0]}</span>
                      <span className="block">{s.headline[1]}</span>
                      <span className={cn("block", f.headline)}>{s.headline[2]}</span>
                    </Heading>
                    <p className="mt-5 max-w-[520px] text-[16px] leading-relaxed text-v2-ink-soft md:text-[17px]">
                      {s.lede}
                    </p>
                    <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                      <Link href={s.cta.href} className={buttonVariants("accent", "lg", "w-full sm:w-auto")}>
                        {s.cta.label}
                        <ArrowRightIcon className="h-4 w-4" />
                      </Link>
                      {DEMO_VIDEO_URL && (
                        <a
                          href={DEMO_VIDEO_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={buttonVariants("ghost", "lg", "w-full bg-white sm:w-auto")}
                        >
                          <PlayIcon className="h-4 w-4" />
                          Watch demo
                        </a>
                      )}
                    </div>
                    <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2.5">
                      {s.ticks.map((t) => (
                        <li key={t} className="flex items-center gap-2 text-[13.5px] font-medium text-v2-ink-soft">
                          <CheckCircleIcon className={cn("h-[18px] w-[18px] flex-none", f.icon)} />
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="min-w-0">{s.art}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Controls: prev / dots / next. Arrows from md; dots are 44px hit areas with 8px discs. */}
      <div className="relative flex items-center justify-center gap-2 pb-5 pt-3">
        <button
          type="button"
          aria-label="Previous slide"
          onClick={() => go(index - 1)}
          className="hidden h-11 w-11 place-items-center rounded-full border border-v2-line bg-white text-v2-navy shadow-v2-card transition hover:bg-v2-canvas md:grid"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <div className="flex items-center">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Slide ${i + 1} of ${count}: ${s.title}`}
              aria-current={i === index ? "true" : undefined}
              onClick={() => go(i)}
              className="group grid h-11 w-11 place-items-center rounded-full"
            >
              <span
                className={cn(
                  "h-2 rounded-full transition-all duration-300 group-hover:bg-v2-navy/60",
                  i === index ? "w-6 bg-v2-navy" : "w-2 bg-v2-navy/25",
                )}
              />
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Next slide"
          onClick={() => go(index + 1)}
          className="hidden h-11 w-11 place-items-center rounded-full border border-v2-line bg-white text-v2-navy shadow-v2-card transition hover:bg-v2-canvas md:grid"
        >
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      </div>

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {`Slide ${index + 1} of ${count}: ${slides[index].title}`}
      </div>
    </section>
  );
}
