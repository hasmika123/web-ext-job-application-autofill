import { cn } from "@kiwiply/ui";
import Eyebrow from "./Eyebrow";
import { FAMILY, type Family } from "./family";

/**
 * Eyebrow + h2 (with an optional coloured trailing phrase) + lede. Spec section 4.
 * The accent phrase uses the family's AA-safe `headline` colour; the h2 size follows spec
 * section 2.3 (28px mobile, 36 / 40px desktop). `caps` renders the eyebrow as the board's small
 * uppercase pill ("TRACK APPLICATIONS").
 */
export default function SectionHeading({
  id,
  eyebrow,
  family = "lime",
  caps,
  title,
  accent,
  accentFamily,
  lede,
  align = "left",
  className,
}: {
  /** id for the h2, so a section can point `aria-labelledby` at it. */
  id?: string;
  eyebrow: string;
  family?: Family;
  /** Uppercase, letter-spaced eyebrow. */
  caps?: boolean;
  title: string;
  /** Coloured trailing words of the heading. */
  accent?: string;
  /** Colour family for the accent words (defaults to `family`). */
  accentFamily?: Family;
  lede?: string;
  align?: "left" | "center";
  className?: string;
}) {
  const centered = align === "center";
  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        centered ? "items-center text-center" : "items-start text-left",
        className,
      )}
    >
      <Eyebrow family={family} className={caps ? "px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-wide" : undefined}>
        {eyebrow}
      </Eyebrow>
      <h2 id={id} className="max-w-3xl text-[30px] text-v2-navy md:text-4xl lg:text-[40px]">
        {title}
        {accent ? (
          <>
            {" "}
            <span className={FAMILY[accentFamily ?? family].headline}>{accent}</span>
          </>
        ) : null}
      </h2>
      {lede ? <p className="max-w-xl text-base leading-relaxed text-v2-ink-soft md:text-[17px]">{lede}</p> : null}
    </div>
  );
}
