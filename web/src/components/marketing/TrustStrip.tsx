import type { ReactNode } from "react";
import { CheckIcon, ZapIcon, cn } from "@kiwiply/ui";
import { ON_THE_ROADMAP, PARTNERS_TRUST_LINE, WORKS_TODAY, type Partner } from "./partners-data";

/**
 * Trust line + support rows directly under the hero (spec 13.2 item 1). Two labelled rows of
 * styled TEXT wordmarks (no logo files): "Works today" (each with a green check) and "On the
 * roadmap" (muted, each with a "Soon" chip, then a link to `#roadmap`). `TrustRows` is exported so
 * `/v3` shows the same rows. Both rows wrap on phones. Data lives in `partners-data.ts` and states
 * real support only - edit it when support changes.
 */

function Wordmark({ p }: { p: Partner }) {
  const style = { color: p.color };
  const glyph = p.glyphColor ?? p.color;
  switch (p.glyph) {
    case "in-tile":
      return (
        <span className="inline-flex items-center gap-[3px]" style={style}>
          {p.text}
          <span
            aria-hidden
            className="grid h-[22px] w-[22px] place-items-center rounded-[5px] text-[16px] leading-none text-white"
            style={{ background: glyph }}
          >
            in
          </span>
        </span>
      );
    case "bolt":
      return (
        <span className="inline-flex items-center gap-1" style={style}>
          <ZapIcon className="h-[22px] w-[22px]" fill={glyph} stroke={glyph} style={{ color: glyph }} />
          {p.text}
        </span>
      );
    case "bars":
      return (
        <span className="inline-flex items-center gap-1.5" style={style}>
          <span aria-hidden className="flex h-[22px] items-end gap-[3px]">
            <span className="h-[14px] w-[4px] rounded-full" style={{ background: glyph }} />
            <span className="h-[22px] w-[4px] rounded-full" style={{ background: glyph }} />
            <span className="h-[17px] w-[4px] rounded-full" style={{ background: glyph }} />
          </span>
          {p.text}
        </span>
      );
    case "arc": {
      // "workday": a small orange half-ring floats above the final "d".
      const head = p.text.slice(0, -1);
      const last = p.text.slice(-1);
      return (
        <span style={style}>
          {head}
          <span className="relative inline-block">
            {last}
            <span
              aria-hidden
              className="absolute -top-[3px] left-1/2 h-[7px] w-[14px] -translate-x-1/2 rounded-t-full border-[3px] border-b-0"
              style={{ borderColor: glyph }}
            />
          </span>
        </span>
      );
    }
    default:
      return <span style={style}>{p.text}</span>;
  }
}

const ITEM =
  "inline-flex flex-none items-center gap-1.5 whitespace-nowrap text-[18px] font-extrabold leading-none tracking-[-0.03em] md:text-[22px]";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 md:grid md:grid-cols-[120px_minmax(0,1fr)] md:items-center md:gap-6">
      <p className="text-center text-[11.5px] font-bold uppercase tracking-[0.08em] text-v2-muted md:text-right">{label}</p>
      <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-4 md:justify-start md:gap-x-9">{children}</ul>
    </div>
  );
}

/** The "Works today" + "On the roadmap" rows (no section wrapper, so any surface can host them). */
export function TrustRows({ className }: { className?: string }) {
  return (
    <div className={cn("mx-auto flex w-full max-w-[1100px] flex-col gap-6 md:gap-5", className)}>
      <Row label="Works today">
        {WORKS_TODAY.map((p) => (
          <li key={p.name} className={ITEM}>
            <span className="sr-only">{p.name}, works today</span>
            <span aria-hidden>
              <Wordmark p={p} />
            </span>
            <CheckIcon aria-hidden className="h-3.5 w-3.5 flex-none text-v2-green" />
          </li>
        ))}
      </Row>
      <Row label="On the roadmap">
        {ON_THE_ROADMAP.map((p) => (
          <li key={p.name} className={ITEM}>
            <span className="sr-only">{p.name}, coming soon</span>
            <span aria-hidden className="opacity-60 grayscale">
              <Wordmark p={p} />
            </span>
            <span
              aria-hidden
              className="rounded-full bg-v2-line/60 px-1.5 py-[3px] text-[10px] font-semibold uppercase leading-none tracking-wide text-v2-muted"
            >
              Soon
            </span>
          </li>
        ))}
      </Row>
    </div>
  );
}

export default function TrustStrip() {
  return (
    <section aria-label="Where Kiwiply works" className="px-5 pb-1 pt-7 md:pb-2 md:pt-8">
      <p className="text-center text-[14px] font-medium text-v2-ink-soft md:text-[15px]">{PARTNERS_TRUST_LINE}</p>
      <TrustRows className="mt-5 md:mt-6" />
    </section>
  );
}
