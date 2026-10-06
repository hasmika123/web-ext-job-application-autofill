"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { CheckIcon, EyeIcon } from "@kiwiply/ui";
import { Badge, Button, Card, Dialog, buttonVariants } from "@/components/ui";
import UpgradeButton from "@/components/billing/UpgradeButton";
import {
  COMPARE,
  CONSULTANCY,
  CONSULTANCY_ADDONS,
  CONSULTANCY_STEPS,
  EXPERT_SERVICES,
  PER_PERSON,
  PLANS,
  contactHref,
  type Offer,
} from "@/lib/catalog";
import { PRICE_3MO, PRICE_MONTHLY } from "@/lib/prices";

/**
 * The landing page's Pricing and Services sections.
 *
 * Cards stay short — a few highlights each — and every card opens a pop-up with the full
 * breakdown, so nothing is crowded and nothing is hidden. A card is one item in a CSS subgrid:
 * its rows (eyebrow, name, tagline, price, price note, highlights, buttons) are shared with every
 * other card in the same row of the grid, so titles, prices and buttons line up even when one
 * card's text wraps and another's doesn't.
 */

type Viewer = {
  signedIn: boolean;
  alreadyPro: boolean;
  /** False when this server has no Stripe key: Pro is shown, but can't be bought yet. */
  billingLive: boolean;
};

/** Cards are clickable as a whole; their own buttons and links must not also open the pop-up. */
function stop(e: React.MouseEvent) {
  e.stopPropagation();
}

// Each card spans 7 subgrid rows: eyebrow · name · tagline · price · price note · highlights · actions.
function OfferCard({
  offer,
  featured,
  onOpen,
  action,
  className = "",
}: {
  offer: Offer;
  featured?: boolean;
  onOpen: () => void;
  action: ReactNode;
  className?: string;
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
      <p className="mt-1.5 text-[13px] text-muted">{offer.priceNote ?? " "}</p>
      <ul className="mt-5 flex flex-col gap-2 text-[13.5px] text-ink-soft">
        {offer.highlights.map((h) => (
          <li key={h} className="flex items-start gap-2">
            <CheckIcon className="mt-[3px] h-3.5 w-3.5 shrink-0 text-accent-deep" />
            <span>{h}</span>
          </li>
        ))}
      </ul>
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
function OfferDialog({ offer, open, onClose, footer, extra }: { offer: Offer; open: boolean; onClose: () => void; footer: ReactNode; extra?: ReactNode }) {
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

function ContactButton({ offer, full = true }: { offer: Offer; full?: boolean }) {
  return (
    <Link href={contactHref(offer.topic ?? "other")} className={buttonVariants("ghost", "md", full ? "w-full" : "")}>
      Contact us
    </Link>
  );
}

/** Stated next to the button, not only in the Terms — the FTC's negative-option rule expects it there. */
function RenewalNote({ className = "" }: { className?: string }) {
  return (
    <p className={"text-[12.5px] leading-relaxed text-muted " + className}>
      Pro renews automatically — monthly, or every 3 months — until you cancel. Cancel any time in Settings ›
      Billing; you keep Pro to the end of the period you paid for. No refunds for partial periods. See the{" "}
      <Link href="/terms#billing" className="font-medium text-accent-deep hover:underline">
        Terms
      </Link>
      .
    </p>
  );
}

function Grid({ children, className = "" }: { children: ReactNode; className?: string }) {
  // Row gap is set per card (the subgrid's own gap is 0); this gap separates rows of cards.
  return <div className={"grid gap-x-5 gap-y-5 sm:grid-cols-2 lg:grid-cols-4 " + className}>{children}</div>;
}

export function PricingSection({ signedIn, alreadyPro, billingLive }: Viewer) {
  const [open, setOpen] = useState<string | null>(null);
  const close = () => setOpen(null);

  function proAction(inDialog: boolean): ReactNode {
    if (alreadyPro) {
      return (
        <Link href="/settings#billing" className={buttonVariants("ghost", "md", "w-full")}>
          You&apos;re on Pro — manage it
        </Link>
      );
    }
    if (!signedIn) return <UpgradeButton plan="monthly" signedOut label="Get Pro" className="w-full" />;
    if (!billingLive) {
      return (
        <Button variant="accent" disabled className="w-full">
          Payments open soon
        </Button>
      );
    }
    if (!inDialog) return <UpgradeButton plan="monthly" label={`Go Pro — ${PRICE_MONTHLY}/mo`} className="w-full" />;
    return (
      <>
        <UpgradeButton plan="3mo" variant="ghost" label={`${PRICE_3MO} every 3 months`} />
        <UpgradeButton plan="monthly" label={`${PRICE_MONTHLY} a month`} />
      </>
    );
  }

  function action(offer: Offer, inDialog = false): ReactNode {
    if (offer.id === "free") {
      return signedIn ? (
        <Link href="/dashboard" className={buttonVariants("ghost", "md", inDialog ? "" : "w-full")}>
          Go to your dashboard
        </Link>
      ) : (
        <Link href="/signup" className={buttonVariants("accent", "md", inDialog ? "" : "w-full")}>
          Get started free
        </Link>
      );
    }
    if (offer.id === "pro") return proAction(inDialog);
    return <ContactButton offer={offer} full={!inDialog} />;
  }

  function extra(offer: Offer): ReactNode {
    return offer.id === "pro" ? <RenewalNote /> : null;
  }

  const current = PLANS.find((p) => p.id === open);

  return (
    <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-6 pb-[70px]">
      <h2 className="text-center text-[27px] font-semibold text-ink sm:text-[34px]">Start free. Upgrade when you&apos;re ready.</h2>
      <p className="mx-auto mb-10 mt-2 max-w-[560px] text-center text-base text-muted">
        Autofill and tracking are free for good. Pay only for what does more of the work.
      </p>

      <Grid>
        {PLANS.map((p) => (
          <OfferCard key={p.id} offer={p} featured={p.id === "pro"} onOpen={() => setOpen(p.id)} action={action(p)} />
        ))}
      </Grid>

      <div className="mt-8 flex flex-col items-center gap-4 text-center">
        <Button variant="ghost" onClick={() => setOpen("compare")}>
          Compare plans side by side
        </Button>
        <RenewalNote className="max-w-2xl" />
      </div>

      {current?.id === CONSULTANCY.id ? (
        <ConsultancyDialog onClose={close} />
      ) : (
        current && <OfferDialog offer={current} open onClose={close} footer={action(current, true)} extra={extra(current)} />
      )}
      <CompareDialog open={open === "compare"} onClose={close} />
    </section>
  );
}

function Cell({ value }: { value: string | boolean }) {
  if (value === true) return <CheckIcon className="mx-auto h-4 w-4 text-accent-deep" aria-label="Included" />;
  if (value === false) return <span className="text-muted" aria-label="Not included">—</span>;
  return <span className="font-medium text-ink">{value}</span>;
}

function CompareDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Compare plans" description="Consultancy is priced per person — see its card." className="sm:max-w-2xl">
      <div className="-mx-1">
        <table className="w-full border-collapse text-[12.5px] sm:text-[13.5px]">
          <thead>
            <tr className="border-b border-line">
              <th className="py-2.5 pr-3 text-left font-semibold text-muted" scope="col">
                <span className="sr-only">Feature</span>
              </th>
              {["Free", "Pro", "Autopilot"].map((h) => (
                <th key={h} scope="col" className="w-[21%] py-2.5 text-center font-display text-[15px] font-semibold text-ink sm:text-base">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE.map((r) => (
              <tr key={r.feature} className="border-b border-line last:border-0">
                <th scope="row" className="py-2.5 pr-3 text-left font-normal text-ink-soft">
                  {r.feature}
                </th>
                <td className="py-2.5 text-center">
                  <Cell value={r.free} />
                </td>
                <td className="py-2.5 text-center">
                  <Cell value={r.pro} />
                </td>
                <td className="py-2.5 text-center">
                  <Cell value={r.autopilot} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}

/** A small uppercase label for a block inside a pop-up. */
function Label({ children }: { children: ReactNode }) {
  return <p className="text-[11.5px] font-bold uppercase tracking-[.08em] text-muted">{children}</p>;
}

function CheckList({ items, className = "" }: { items: string[]; className?: string }) {
  return (
    <ul className={"flex flex-col gap-1.5 text-[13.5px] text-ink-soft " + className}>
      {items.map((i) => (
        <li key={i} className="flex items-start gap-2">
          <CheckIcon className="mt-[3px] h-3.5 w-3.5 shrink-0 text-accent-deep" />
          <span>{i}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The Consultancy pop-up: wider than the others and laid out in the order a buyer asks —
 * what does it cost, how does it work, what does each person get, what's included, what can we add.
 */
function ConsultancyDialog({ onClose }: { onClose: () => void }) {
  const tiles = [
    { value: CONSULTANCY.price, label: "One-time setup" },
    { value: `From ${PER_PERSON[0].price}`, label: "Per person, per month" },
    { value: "Optional", label: "Marketer and Ops add-ons" },
  ];
  return (
    <Dialog
      open
      onClose={onClose}
      title={CONSULTANCY.name}
      description={CONSULTANCY.tagline}
      className="sm:max-w-4xl"
      footer={<ContactButton offer={CONSULTANCY} full={false} />}
    >
      <div className="flex flex-col gap-7 py-1">
        {/* What it costs */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-[var(--radius)] bg-paper-2 px-2.5 py-2 sm:px-4 sm:py-3">
              <p className="font-display text-[15px] font-bold leading-tight text-ink sm:text-2xl">{t.value}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-muted sm:text-[12.5px]">{t.label}</p>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div>
          <Label>How it works</Label>
          <ol className="mt-3 grid gap-4 sm:grid-cols-3">
            {CONSULTANCY_STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft font-display text-sm font-bold text-accent-deep">
                  {i + 1}
                </span>
                <div>
                  <p className="text-[14px] font-semibold text-ink">{step.title}</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Per person */}
        <div>
          <Label>Choose for each person</Label>
          <table className="mt-1 w-full border-collapse text-[13.5px]">
            <tbody>
              {PER_PERSON.map((row) => (
                <tr key={row.item} className="border-b border-line last:border-0">
                  <td className="py-2.5 pr-4">
                    <p className="font-semibold text-ink">{row.item}</p>
                    <p className="text-[12.5px] text-muted">{row.what}</p>
                  </td>
                  <td className="whitespace-nowrap py-2.5 text-right align-top">
                    <span className="font-bold text-ink">{row.price}</span>{" "}
                    <span className="block text-[12px] text-muted sm:inline">{row.note}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[12.5px] text-muted">You pay nothing for a person until you assign them something.</p>
        </div>

        {/* What's included */}
        <div>
          <Label>What&apos;s included</Label>
          <div className="mt-3 grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
            {CONSULTANCY.details.map((g) => (
              <div key={g.heading}>
                <p className="text-[13.5px] font-semibold text-ink">{g.heading}</p>
                <CheckList items={g.items} className="mt-2" />
              </div>
            ))}
          </div>
        </div>

        {/* Add-ons */}
        <div>
          <Label>Add-ons</Label>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {CONSULTANCY_ADDONS.map((a) => (
              <div key={a.id} className="flex flex-col rounded-[var(--radius-lg)] border border-line p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="font-display text-lg font-semibold text-ink">{a.name}</p>
                  <p>
                    <span className="font-bold text-ink">{a.price}</span>
                    <span className="text-[12px] text-muted">{a.unit}</span>
                  </p>
                </div>
                <p className="mt-0.5 text-[13px] text-muted">{a.tagline}</p>
                <CheckList items={a.highlights} className="mt-3" />
                {a.limits && <p className="mt-3 text-[12px] leading-relaxed text-muted">{a.limits.join(" · ")}</p>}
                <Link
                  href={contactHref(a.topic ?? "organization")}
                  className="mt-auto pt-3 text-[13px] font-semibold text-accent-deep hover:underline"
                >
                  Ask about {a.name} →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

export function ServicesSection() {
  const [open, setOpen] = useState<string | null>(null);
  const current = EXPERT_SERVICES.find((s) => s.id === open);

  return (
    <section id="services" className="mx-auto max-w-6xl scroll-mt-20 px-6 pb-[84px]">
      <h2 className="text-center text-[27px] font-semibold text-ink sm:text-[34px]">Services</h2>
      <p className="mx-auto mb-10 mt-2 max-w-[600px] text-center text-base text-muted">
        One-off help from vetted resume writers, interviewers and coaches. Pro and Autopilot members get 10% off.
      </p>
      <Grid>
        {EXPERT_SERVICES.map((s) => (
          <OfferCard key={s.id} offer={s} onOpen={() => setOpen(s.id)} action={<ContactButton offer={s} />} />
        ))}
      </Grid>
      {current && <OfferDialog offer={current} open onClose={() => setOpen(null)} footer={<ContactButton offer={current} full={false} />} />}
    </section>
  );
}
