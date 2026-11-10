"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { CheckIcon, EyeIcon } from "@kiwiply/ui";
import { Badge, Card, Dialog } from "@/components/ui";
import type { Offer } from "@/lib/catalog";

/**
 * The pricing page's card, its "What's included" pop-up and the pieces they share. Split out of PricingSections.tsx so the catalog-driven cards
 * (CatalogPricing.tsx, K5.1) and the static ones (today's content, used when the catalog has no sellable plan) look identical.
 */

/** Cards are clickable as a whole; their own buttons and links must not also open the pop-up. */
export function stop(e: React.MouseEvent) {
  e.stopPropagation();
}

// Each card spans 7 subgrid rows: eyebrow · name · tagline · price · price note · highlights · actions.
export function OfferCard({
  offer,
  featured,
  onOpen,
  action,
  className = "",
  body,
}: {
  offer: Offer;
  featured?: boolean;
  onOpen: () => void;
  action: ReactNode;
  className?: string;
  /** Rendered under the highlights, inside the same row (the add-on rows and the Total of a catalog card). */
  body?: ReactNode;
}) {
  return (
    <Card
      onClick={onOpen}
      className={
        "row-span-7 grid cursor-pointer grid-rows-subgrid gap-y-0 transition-shadow hover:shadow-[var(--shadow-lg)] " +
        (featured ? "border-2 border-accent " : "") +
        className
      }
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11.5px] font-bold uppercase tracking-[.08em] text-accent-deep">{offer.eyebrow}</p>
        {offer.badge && <Badge className="shrink-0">{offer.badge}</Badge>}
      </div>
      <h3 className="mt-1.5 font-display text-xl font-semibold text-ink">{offer.name}</h3>
      <p className="mt-1 text-sm leading-snug text-muted">{offer.tagline}</p>
      <p className="mt-4 font-display text-[32px] font-bold leading-none tracking-tight text-ink">
        {offer.price}
        {offer.unit && <span className="font-body text-sm font-medium tracking-normal text-muted">{offer.unit}</span>}
      </p>
      <p className="mt-1.5 text-[13px] text-muted">{offer.priceNote ?? " "}</p>
      <div>
        <ul className="mt-5 flex flex-col gap-2 text-[13.5px] text-ink-soft">
          {offer.highlights.map((h) => (
            <li key={h} className="flex items-start gap-2">
              <CheckIcon className="mt-[3px] h-3.5 w-3.5 shrink-0 text-accent-deep" />
              <span>{h}</span>
            </li>
          ))}
        </ul>
        {body ? <div onClick={stop}>{body}</div> : null}
      </div>
      <div className="flex flex-col gap-2 pt-6" onClick={stop}>
        {action}
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center justify-center gap-1.5 rounded-full py-1.5 text-[13px] font-semibold text-accent-deep hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <EyeIcon className="h-4 w-4" />
          What&apos;s included
        </button>
      </div>
    </Card>
  );
}

/** The full breakdown of one offer: price, every detail group, the limits, and anything extra. */
export function OfferDialog({
  offer,
  open,
  onClose,
  footer,
  extra,
}: {
  offer: Offer;
  open: boolean;
  onClose: () => void;
  footer: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={offer.name} description={offer.tagline} footer={footer} className="sm:max-w-2xl">
      <div className="flex flex-col gap-5">
        <div>
          <p className="font-display text-[30px] font-bold leading-none tracking-tight text-ink">
            {offer.price}
            {offer.unit && <span className="font-body text-sm font-medium tracking-normal text-muted">{offer.unit}</span>}
          </p>
          {offer.priceNote && <p className="mt-1.5 text-[13px] text-muted">{offer.priceNote}</p>}
        </div>

        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          {offer.details.map((g) => (
            <div key={g.heading}>
              <p className="text-[11.5px] font-bold uppercase tracking-[.08em] text-muted">{g.heading}</p>
              <ul className="mt-2 flex flex-col gap-1.5 text-[13.5px] text-ink-soft">
                {g.items.map((i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckIcon className="mt-[3px] h-3.5 w-3.5 shrink-0 text-accent-deep" />
                    <span>{i}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {extra}

        {offer.limits && offer.limits.length > 0 && (
          <div className="rounded-[var(--radius)] bg-paper-2 px-4 py-3">
            <p className="text-[11.5px] font-bold uppercase tracking-[.08em] text-muted">Good to know</p>
            <ul className="mt-1.5 flex flex-col gap-1 text-[13px] text-ink-soft">
              {offer.limits.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/** Stated next to the button, not only in the Terms: the FTC's negative-option rule expects it there. */
export function RenewalNote({ className = "", plan = "Pro", cadence = "monthly, or every 3 months" }: { className?: string; plan?: string; cadence?: string }) {
  return (
    <p className={"text-[12.5px] leading-relaxed text-muted " + className}>
      {plan} renews automatically — {cadence} — until you cancel. Cancel any time in Settings › Billing; you keep {plan} to the end of the period you
      paid for. No refunds for partial periods. See the{" "}
      <Link href="/terms#billing" className="font-medium text-accent-deep hover:underline">
        Terms
      </Link>
      .
    </p>
  );
}

export function Grid({ children, className = "" }: { children: ReactNode; className?: string }) {
  // Row gap is set per card (the subgrid's own gap is 0); this gap separates rows of cards.
  return <div className={"grid gap-x-5 gap-y-5 sm:grid-cols-2 lg:grid-cols-4 " + className}>{children}</div>;
}
