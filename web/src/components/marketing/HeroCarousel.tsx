"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ArrowRightIcon, CheckCircleIcon, PlayIcon, SparklesIcon, cn } from "@kiwiply/ui";
import { DEMO_VIDEO_URL } from "@/lib/site";
import Eyebrow from "./Eyebrow";
import { FAMILY, type Family } from "./family";
import HeroFeatureStrip from "./hero/HeroFeatureStrip";

/**
 * Hero carousel (spec section 6, rebuilt to the boards in V2.2x). Four audience slides on a
 * translateX track; the section paints its own wash + bokeh and the (transparent) site header
 * overlays its top edge.
 *
 * Client component, but it never imports `media.tsx` (that reads the filesystem): the server page
 * renders each slide's art (`HeroArt`) and passes it in as the `art` node, alongside the plain,
 * serialisable copy. Behaviour: 7s autoplay that pauses on hover / keyboard focus-within / hidden
 * tab and is off under prefers-reduced-motion; dots (no arrows - Left/Right keys when the region has
 * focus and touch/pen swipe, 40px, do the rest); inactive slides are `aria-hidden` + `inert`; a
 * polite live region announces the slide on change. All slides sit in one flex row, so the row is as
 * tall as the tallest slide and nothing shifts when the slide changes.
 *
 * Slide 1 only: from xl a white four-tile feature strip overlaps the hero's bottom edge (faded in
 * while that slide is active) and the ticks row is not shown (the board has none there).
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
  /** Server-rendered art side (person, mascot, floating cards, doodles). */
  art: ReactNode;
}

const AUTOPLAY_MS = 7000;
const SWIPE_PX = 40;

/** Slides whose board shows the feature strip instead of a desktop ticks row. */
const STRIP_SLIDES = new Set(["copilot", "copilot-alt"]);

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

const CTA_PRIMARY =
  "inline-flex w-full items-center justify-center gap-2.5 rounded-[12px] bg-accent px-8 py-[17px] text-[16px] font-bold leading-none " +
  "text-on-accent no-underline shadow-[0_10px_24px_rgba(95,191,31,.30)] transition hover:brightness-95 active:translate-y-px " +
  "sm:w-auto md:px-5 md:py-3 md:text-[14.5px] xl:px-8 xl:py-[19px] xl:text-[17px]";

const CTA_DEMO =
  "group inline-flex w-full items-center justify-center gap-3 rounded-[14px] border border-v2-line bg-white px-5 py-2.5 no-underline " +
  "shadow-v2-card transition hover:shadow-v2-float sm:w-auto sm:justify-start sm:border-white/80 sm:pr-8 md:gap-2.5 md:px-3.5 md:py-1.5 md:pr-5 xl:gap-3 xl:px-5 xl:py-2.5 xl:pr-8";

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

  const demoHref = DEMO_VIDEO_URL ?? "#how";
  const demoExternal = DEMO_VIDEO_URL !== null;
  const stripOn = STRIP_SLIDES.has(slides[index].id);

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
      className="relative isolate outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-v2-navy/40"
    >
      {/* The hero paints its own background: a white -> pale-blue wash, bokeh (lime upper-left behind
          the headline, sky-blue upper-right) and soft foliage tints in the bottom corners. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-gradient-to-b from-white via-[#F1F7FF] to-v2-canvas">
        <div className="absolute -left-[14%] -top-[6%] h-[640px] w-[820px] [background:radial-gradient(closest-side,rgba(186,238,132,.55),rgba(186,238,132,0))]" />
        <div className="absolute -right-[10%] -top-[10%] h-[680px] w-[900px] [background:radial-gradient(closest-side,rgba(166,208,255,.62),rgba(166,208,255,0))]" />
        <div className="absolute -bottom-24 -left-24 h-[300px] w-[520px] [background:radial-gradient(closest-side,rgba(150,214,118,.42),rgba(150,214,118,0))]" />
        <div className="absolute -bottom-28 -right-24 h-[300px] w-[560px] [background:radial-gradient(closest-side,rgba(150,214,118,.34),rgba(150,214,118,0))]" />
      </div>

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
            const hasStrip = STRIP_SLIDES.has(s.id);
            return (
              <div
                key={s.id}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${count}: ${s.title}`}
                aria-hidden={!active}
                inert={!active}
                className="w-full flex-none overflow-x-clip"
              >
                {/* Below md (phones) the slide is one column: copy, art, buttons + ticks. From md it is
                    two columns, copy 46% / art 54% (the art bleeds past the container edge), and the
                    art cell scales fluidly with its column (see HeroArt / .hero-art-cell in globals.css). */}
                <div
                  className={cn(
                    "relative mx-auto flex h-full max-w-[1320px] flex-col px-5 pb-4 pt-[88px]",
                    "md:grid md:grid-cols-[minmax(0,46fr)_minmax(0,54fr)] md:items-start md:px-6 md:pt-[96px] lg:px-8 lg:pt-[104px]",
                    hasStrip ? "md:pb-[var(--hero-pb)] [--hero-pb:0px] max-[1099px]:[--hero-pb:112px] max-[899px]:[--hero-pb:196px]" : "md:pb-0",
                  )}
                >
                  <div
                    className={cn(
                      "contents md:relative md:z-20 md:col-start-1 md:row-start-1 md:block md:self-start",
                      hasStrip ? "min-[1100px]:pb-[150px]" : "md:pb-6",
                    )}
                  >
                    <div className="order-1 min-w-0">
                      <Eyebrow family={s.family} icon={SparklesIcon} bordered className="text-[14px]">
                        {s.eyebrow}
                      </Eyebrow>
                      <Heading className="mt-5 text-[36px] text-v2-navy md:mt-4 md:text-[clamp(34px,4.2vw,64px)]">
                        <span className="block">{s.headline[0]}</span>
                        <span className="block">{s.headline[1]}</span>
                        <span className={cn("block", f.headline)}>{s.headline[2]}</span>
                      </Heading>
                      <p className="mt-4 max-w-[560px] text-[15.5px] leading-[1.6] text-v2-ink-soft md:mt-3 md:max-w-[500px] md:text-[clamp(14.5px,1.2vw,18px)] md:leading-[1.5]">
                        {s.lede}
                      </p>
                    </div>
                    <div className="order-3 min-w-0">
                      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 md:mt-5 md:gap-3 xl:mt-6 xl:gap-4">
                        <Link href={s.cta.href} className={CTA_PRIMARY}>
                          {s.cta.label}
                          <ArrowRightIcon className="h-[18px] w-[18px]" />
                        </Link>
                        <a
                          href={demoHref}
                          {...(demoExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                          className={CTA_DEMO}
                        >
                          <span aria-hidden className="grid h-10 w-10 flex-none place-items-center rounded-full bg-white md:h-9 md:w-9 xl:h-10 xl:w-10 text-v2-navy shadow-[0_2px_8px_rgba(27,31,94,.12)] transition group-hover:scale-105">
                            <PlayIcon className="h-[18px] w-[18px]" />
                          </span>
                          <span className="text-left leading-tight">
                            <span className="block text-[15.5px] font-bold text-v2-navy">Watch Demo</span>
                            <span className="block text-[13.5px] text-v2-ink-soft">2 min</span>
                          </span>
                        </a>
                      </div>
                      <ul
                        className={cn(
                          "mt-6 grid grid-cols-3 gap-2 md:mt-4 md:flex md:flex-wrap md:gap-x-4 md:gap-y-1.5 xl:mt-5 xl:gap-x-5",
                          hasStrip && "md:hidden",
                        )}
                      >
                        {s.ticks.map((t) => (
                          <li
                            key={t}
                            className="flex flex-col items-center gap-1.5 text-center text-[11.5px] font-medium leading-tight text-v2-ink-soft md:flex-row md:gap-1.5 md:text-left md:text-[12.5px] xl:gap-2 xl:text-[13px]"
                          >
                            <CheckCircleIcon className="h-[22px] w-[22px] flex-none text-[#4B49D6] md:h-5 md:w-5 xl:h-[24px] xl:w-[24px]" />
                            {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div
                    className={cn(
                      "hero-art-col order-2 md:order-none md:col-start-2 md:row-start-1 md:self-start",
                    )}
                  >
                    {s.art}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* From md a soft fade dissolves the cut-off person into the page colour at the hero's edge. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-10 hidden h-14 bg-gradient-to-t from-v2-canvas to-transparent md:block" />

      {/* Slide 1 only: the four-tile strip overlaps the hero's bottom edge (md+; 2x2 tiles below 1100px). */}
      <div
        aria-hidden={!stripOn}
        inert={!stripOn}
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-[22px] z-20 hidden px-4 transition-opacity duration-300 motion-reduce:transition-none md:block lg:px-5",
          stripOn ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="pointer-events-auto mx-auto max-w-[1400px]">
          <HeroFeatureStrip />
        </div>
      </div>

      {/* Dots: small and subtle, centred at the hero's bottom (24px hit areas, 8px discs). */}
      <div className="relative z-30 flex items-center justify-center pb-3 md:absolute md:inset-x-0 md:bottom-0 md:pb-0.5">
        <div className="flex items-center">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Slide ${i + 1} of ${count}: ${s.title}`}
              aria-current={i === index ? "true" : undefined}
              onClick={() => go(i)}
              className="group grid h-6 w-6 cursor-pointer place-items-center rounded-full"
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full transition-all duration-300 group-hover:bg-v2-navy/60",
                  i === index ? "bg-v2-navy" : "bg-v2-navy/30",
                )}
              />
            </button>
          ))}
        </div>
      </div>

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {`Slide ${index + 1} of ${count}: ${slides[index].title}`}
      </div>
    </section>
  );
}
