import {
  Confetti,
  CurvedArrow,
  PaperPlane,
  SparkBurst,
  Squiggle,
  StarDoodle,
  cn,
} from "@kiwiply/ui";
import FloatingCard from "./FloatingCard";
import Handwritten from "./Handwritten";
import { FAMILY } from "./family";
import { Mascot, Photo } from "./media";
import type { CardBody, DoodleKind, HeroCardSpec, HeroSlide } from "./hero-slides";

/**
 * Art side of one hero slide (server component: `Photo` / `Mascot` read the filesystem).
 * One DOM tree, two layouts:
 *  - below md: photo (4:3) with the mascot overlapping its bottom-right corner, then the first
 *    two floating cards stacked underneath - nothing absolutely positioned except the mascot
 *    corner overlap;
 *  - md and up: a 600px-tall stage - photo anchored bottom-centre, mascot bottom-right,
 *    three to five tilted cards, doodles and one handwritten note placed around them.
 * `HeroCarousel` (client) receives the rendered node as a prop, so it never imports media.tsx.
 */

function DoodleGlyph({ kind, className }: { kind: DoodleKind; className: string }) {
  switch (kind) {
    case "spark":
      return <SparkBurst className={className} />;
    case "arrow-dr":
      return <CurvedArrow direction="down-right" className={className} />;
    case "arrow-dl":
      return <CurvedArrow direction="down-left" className={className} />;
    case "arrow-ur":
      return <CurvedArrow direction="up-right" className={className} />;
    case "star":
      return <StarDoodle className={className} />;
    case "plane":
      return <PaperPlane className={className} />;
    case "confetti":
      return <Confetti className={className} />;
    case "squiggle":
      return <Squiggle className={className} />;
  }
}

const EXAMPLE = <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-v2-muted">Example</p>;

function CardBodyView({ body }: { body: CardBody }) {
  switch (body.kind) {
    case "rows":
      return (
        <ul className="mt-3 space-y-2">
          {body.rows.map((r) => (
            <li key={r.primary} className="flex items-center gap-2.5">
              <span
                aria-hidden
                className={cn(
                  "grid h-8 w-8 flex-none place-items-center rounded-lg text-[13px] font-bold",
                  FAMILY[r.tone].soft,
                  FAMILY[r.tone].deep,
                )}
              >
                {r.mark}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold leading-tight text-v2-navy">{r.primary}</span>
                <span className="block truncate text-[11.5px] leading-tight text-v2-muted">{r.secondary}</span>
              </span>
              <span
                className={cn(
                  "flex-none rounded-md px-1.5 py-1 text-[11px] font-bold leading-none",
                  FAMILY[r.tone].soft,
                  FAMILY[r.tone].deep,
                )}
              >
                {r.badge}
              </span>
            </li>
          ))}
        </ul>
      );
    case "chips":
      return (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {body.chips.map((c) => (
            <li key={c} className="rounded-full bg-v2-blue-soft px-2.5 py-1 text-[12px] font-semibold text-[#1A5BD6]">
              {c}
            </li>
          ))}
        </ul>
      );
    case "bars":
      return (
        <div aria-hidden className="mt-3 flex h-16 items-end gap-1.5">
          {body.bars.map((h, i) => (
            <span key={i} className="w-full rounded-t bg-v2-green" style={{ height: `${h}%`, opacity: 0.45 + h / 180 }} />
          ))}
        </div>
      );
    case "table":
      return (
        <ul className="mt-3 divide-y divide-v2-line">
          {body.rows.map((r) => (
            <li key={r.name} className="flex items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold leading-tight text-v2-navy">{r.name}</span>
                <span className="block truncate text-[11.5px] leading-tight text-v2-muted">{r.role}</span>
              </span>
              <span
                className={cn(
                  "flex-none rounded-md px-1.5 py-1 text-[11px] font-bold leading-none",
                  FAMILY[r.tone].soft,
                  FAMILY[r.tone].deep,
                )}
              >
                {r.stage}
              </span>
            </li>
          ))}
        </ul>
      );
  }
}

function Card({ card, index }: { card: HeroCardSpec; index: number }) {
  return (
    <FloatingCard
      icon={card.icon}
      family={card.family}
      title={card.title}
      subtitle={card.subtitle}
      tilt={card.tilt}
      className={cn(
        // Below md only the first two cards show, stacked in flow; md+ they float.
        index > 1 && "hidden md:block",
        "relative z-10 md:absolute",
        card.pos,
      )}
    >
      {card.body && <CardBodyView body={card.body} />}
      {card.example && EXAMPLE}
    </FloatingCard>
  );
}

export default function HeroArt({ slide, priority = false }: { slide: HeroSlide; priority?: boolean }) {
  return (
    <div className="relative md:mx-auto md:h-[600px] md:max-w-[620px] lg:max-w-none">
      {/* Photo + mascot. `md:contents` drops this wrapper's box on md+, so the absolutely
          positioned children below anchor to the stage instead of the mobile photo frame. */}
      <div className="relative md:contents">
        <div className="aspect-[4/3] w-full overflow-hidden rounded-3xl shadow-v2-card md:absolute md:bottom-2 md:left-1/2 md:aspect-auto md:h-[66%] md:w-[56%] md:-translate-x-1/2 md:rounded-[32px]">
          <Photo
            id={slide.photo}
            alt={slide.photoAlt}
            priority={priority}
            className="h-full w-full"
            sizes="(min-width: 1024px) 340px, (min-width: 768px) 340px, 100vw"
          />
        </div>
        <div className="absolute -bottom-7 right-2 z-20 h-28 w-28 md:bottom-0 md:right-0 md:h-40 md:w-40">
          <Mascot pose={slide.mascot} className="h-full w-full" />
        </div>
      </div>

      <div className="mt-10 grid gap-4 md:mt-0 md:block">
        {slide.cards.map((card, i) => (
          <Card key={card.id} card={card} index={i} />
        ))}
      </div>

      {slide.doodles.map((d, i) => (
        <DoodleGlyph key={i} kind={d.kind} className={cn("pointer-events-none absolute z-10 hidden md:block", d.className)} />
      ))}

      <Handwritten
        family={slide.family}
        className={cn("pointer-events-none absolute z-10 hidden md:block", slide.handwritten.className)}
      >
        {slide.handwritten.text}
      </Handwritten>
    </div>
  );
}
