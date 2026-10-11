import { ZapIcon, cn } from "@kiwiply/ui";
import { PARTNERS, PARTNERS_MORE, PARTNERS_TRUST_LINE, type Partner } from "./partners-data";

/**
 * Trust line + partner wordmarks directly under the hero (spec 13.2 item 1, board
 * landing-desktop-full). Pure text on the page colour: no logo files, no tiles or cards. Desktop is
 * one centred row (~44px gaps); phones get a 3-column grid. Data lives in `partners-data.ts`.
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

export default function TrustStrip() {
  return (
    <section aria-label="Trusted by" className="px-5 pb-1 pt-7 md:pb-2 md:pt-8">
      <p className="text-center text-[14px] font-medium text-v2-ink-soft md:text-[15px]">{PARTNERS_TRUST_LINE}</p>
      <ul
        className={cn(
          "mx-auto mt-5 flex max-w-[1400px] flex-wrap items-center justify-center gap-x-6 gap-y-5",
          "text-[18px] font-extrabold leading-none tracking-[-0.03em] md:mt-6 md:gap-x-10 md:gap-y-4 md:text-[22px]",
        )}
      >
        {PARTNERS.map((p) => (
          <li key={p.name} aria-label={p.name} className="flex-none whitespace-nowrap">
            <Wordmark p={p} />
          </li>
        ))}
        <li className="w-full flex-none text-center text-[13px] font-medium tracking-normal text-v2-muted md:w-auto">
          {PARTNERS_MORE}
        </li>
      </ul>
    </section>
  );
}
