import Link from "next/link";
import { Card, buttonVariants } from "@/components/ui";
import { contactHref, type Offer } from "@/lib/catalog";

/** One bullet in a plan's feature list (Phase 12.3 look, shared by every card on /pricing). */
export function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
      <span>{children}</span>
    </li>
  );
}

/**
 * A plan or service sold through "Contact us" (Phase 15.6): the full scope — what's included and
 * the limits — so a visitor can judge it before talking to us. `compact` is the services grid.
 */
export default function OfferCard({ offer, compact = false }: { offer: Offer; compact?: boolean }) {
  return (
    <Card className="flex h-full flex-col">
      <p className="text-[11.5px] font-bold uppercase tracking-[.08em] text-accent-deep">{offer.audience}</p>
      <h3 className={`mt-1 font-display font-semibold text-ink ${compact ? "text-lg" : "text-xl"}`}>{offer.name}</h3>
      <p className={`mt-1 font-bold tracking-tight text-ink ${compact ? "text-2xl" : "text-3xl"}`}>
        {offer.price}
        {offer.unit && <span className="text-base font-medium text-muted">{offer.unit}</span>}
      </p>
      {offer.priceNote && <p className="mt-1 text-sm text-muted">{offer.priceNote}</p>}
      <p className="mt-3 text-sm text-ink-soft">{offer.summary}</p>

      <ul className="mt-4 flex flex-col gap-2.5 text-sm text-ink-soft">
        {offer.features.map((f) => (
          <Feature key={f}>{f}</Feature>
        ))}
      </ul>

      {offer.limits && offer.limits.length > 0 && (
        <div className="mt-4 rounded-[var(--radius)] bg-paper-2 px-3.5 py-3">
          <p className="text-[11.5px] font-bold uppercase tracking-[.08em] text-muted">Limits</p>
          <ul className="mt-1.5 flex flex-col gap-1 text-[13px] text-ink-soft">
            {offer.limits.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      )}

      {/* mt-auto pins the button to the bottom so a row of cards lines up. */}
      <div className="mt-auto pt-6">
        <Link href={contactHref(offer.topic)} className={buttonVariants("ghost", "md", "w-full")}>
          Contact us
        </Link>
      </div>
    </Card>
  );
}
