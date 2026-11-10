"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoneyText, Tab, TabList, Tabs } from "@kiwiply/ui";
import { Button, Dialog, buttonVariants } from "@/components/ui";
import ReviewSheet from "@/components/billing/ReviewSheet";
import AddonRows from "@/components/pricing/AddonRows";
import { Grid, OfferCard, OfferDialog, RenewalNote } from "@/components/pricing/OfferCard";
import { Cell, ConsultancyDialog, ContactButton } from "@/components/pricing/PricingSections";
import { CONSULTANCY, FREE, PLANS, type Offer } from "@/lib/catalog";
import { addonsFor, isPaid, precomputedTotal, selectionToAddons, visibleIntervals, type Selection } from "@/lib/subscription/catalog";
import { createQuote } from "@/lib/subscription/client";
import { intervalEvery, intervalSuffix, intervalTab, intervalUnit, money, savingsLine } from "@/lib/subscription/copy";
import type { CatalogPlan, Interval, PublicCatalog } from "@/lib/subscription/types";

type Viewer = {
  signedIn: boolean;
  /** False when this server has no Stripe key: plans are shown, but can't be bought yet. */
  billingLive: boolean;
  /** The plan key the visitor holds (GET /api/billing/me v3), or null when Free / signed out. */
  currentPlanKey: string | null;
  /** The visitor holds a paid plan of any kind. */
  onPaidPlan: boolean;
};

const LEGACY: Record<string, Offer> = Object.fromEntries(PLANS.map((p) => [p.id, p]));

/** A catalog plan as the existing card shape, so the cards look exactly like today's. Prices are catalog fields at the chosen interval. */
function planToOffer(plan: CatalogPlan, interval: Interval, currency: string): Offer {
  const legacy = LEGACY[plan.planKey.toLowerCase()];
  const price = plan.prices[interval];
  const paid = isPaid(plan);
  const other = interval === "MONTH" ? plan.prices.QUARTER : undefined;
  const priceNote = !paid
    ? "Free forever"
    : interval !== "MONTH"
      ? savingsLine(price, interval, currency)
      : other
        ? `or ${money(other.amountMinor, currency)} every 3 months`
        : undefined;
  const included = plan.included.map((i) => (i.allowance != null ? `${i.name} - ${i.allowance}${i.unit ? ` ${i.unit}` : ""}` : i.name));
  const details = [{ heading: "What's included", items: included }];
  if (plan.optional.length > 0) details.push({ heading: "Optional add-ons", items: plan.optional.map((o) => o.name) });
  return {
    id: plan.planKey.toLowerCase(),
    eyebrow: legacy?.eyebrow ?? "",
    name: plan.name,
    tagline: plan.description ?? legacy?.tagline ?? "",
    price: paid ? money(price?.amountMinor, currency) : money(0, currency),
    unit: paid ? `/${intervalUnit(interval)}` : undefined,
    priceNote,
    badge: plan.badge ?? undefined,
    highlights: included.slice(0, 4),
    details,
  };
}

/** The total of a basket: the catalog's precomputed one, else an anonymous quote (a priced basket without an account). The browser never adds prices. */
function useBasketTotal(catalog: PublicCatalog, plan: CatalogPlan, interval: Interval, selection: Selection) {
  const pre = precomputedTotal(catalog, plan, interval, selection);
  const key = JSON.stringify(selectionToAddons(selection));
  const [quoted, setQuoted] = useState<{ key: string; minor: number } | null>(null);
  useEffect(() => {
    if (pre !== undefined) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const res = await createQuote({ kind: "CHECKOUT", anonymous: true, planKey: plan.planKey, interval, addons: JSON.parse(key) });
      if (!cancelled && res.ok) setQuoted({ key: `${plan.planKey}|${interval}|${key}`, minor: res.data.proposed.recurringMinor });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pre, plan.planKey, interval, key]);
  if (pre !== undefined) return { minor: pre, pending: false };
  const mine = quoted && quoted.key === `${plan.planKey}|${interval}|${key}` ? quoted.minor : undefined;
  return { minor: mine, pending: mine === undefined };
}

function CatalogPlanCard({
  catalog,
  plan,
  interval,
  viewer,
  featured,
}: {
  catalog: PublicCatalog;
  plan: CatalogPlan;
  interval: Interval;
  viewer: Viewer;
  featured: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState(false);
  const [selection, setSelection] = useState<Selection>({});
  const addons = useMemo(() => addonsFor(plan, interval), [plan, interval]);
  // an add-on with no price at this interval cannot stay ticked
  const live = useMemo(() => {
    const keys = new Set(addons.map((a) => a.featureKey));
    return Object.fromEntries(Object.entries(selection).filter(([k]) => keys.has(k))) as Selection;
  }, [selection, addons]);
  const total = useBasketTotal(catalog, plan, interval, live);
  const paid = isPaid(plan);
  const available = !paid || plan.intervals.includes(interval);
  const offer = planToOffer(plan, interval, catalog.currency);
  const current = viewer.currentPlanKey === plan.planKey;

  function setQty(featureKey: string, quantity: number) {
    setSelection((s) => ({ ...s, [featureKey]: Math.max(0, quantity) }));
  }

  function cta(inDialog: boolean): ReactNode {
    const full = inDialog ? "" : "w-full";
    if (!paid) {
      return viewer.signedIn ? (
        <Link href="/dashboard" className={buttonVariants("ghost", "md", full)}>
          Go to your dashboard
        </Link>
      ) : (
        <Link href="/signup" className={buttonVariants("accent", "md", full)}>
          Get started free
        </Link>
      );
    }
    if (current) {
      return (
        <Link href="/settings/plan" className={buttonVariants("ghost", "md", full)}>
          You&apos;re on {plan.name} — manage add-ons
        </Link>
      );
    }
    if (!available) {
      return (
        <Button variant="ghost" disabled className={full}>
          Not available {interval === "YEAR" ? "yearly" : interval === "QUARTER" ? "every 3 months" : "monthly"}
        </Button>
      );
    }
    if (!viewer.signedIn) {
      return (
        <Button variant="accent" className={full} onClick={() => router.push(`/signup?next=${encodeURIComponent("/pricing")}`)}>
          Get {plan.name}
        </Button>
      );
    }
    if (viewer.onPaidPlan) {
      return (
        <Link href="/settings/plan" className={buttonVariants("ghost", "md", full)}>
          Switch plans in My plan
        </Link>
      );
    }
    if (!viewer.billingLive) {
      return (
        <Button variant="accent" disabled className={full}>
          Payments open soon
        </Button>
      );
    }
    return (
      <Button variant="accent" className={full} onClick={() => setReview(true)}>
        {total.minor !== undefined ? `Go ${plan.name} — ${money(total.minor, catalog.currency)}${intervalSuffix(interval)}` : `Go ${plan.name}`}
      </Button>
    );
  }

  const body =
    paid && available && addons.length > 0 ? (
      <>
        <AddonRows planKey={plan.planKey} addons={addons} interval={interval} currency={catalog.currency} selection={live} onChange={setQty} />
        <p className="mt-3 flex items-baseline justify-between text-[14px]" aria-live="polite" data-testid={`total-${plan.planKey}`}>
          <span className="font-semibold text-ink">Total</span>
          <span className="font-bold text-ink">
            {total.minor !== undefined ? <MoneyText minor={total.minor} currency={catalog.currency} /> : "..."}
            <span className="text-[12.5px] font-medium text-muted">{intervalSuffix(interval)}</span>
          </span>
        </p>
      </>
    ) : null;

  return (
    <>
      <OfferCard offer={offer} featured={featured} onOpen={() => setOpen(true)} action={cta(false)} body={body} />
      {open && <OfferDialog offer={offer} open onClose={() => setOpen(false)} footer={cta(true)} extra={paid ? <RenewalNote plan={plan.name} cadence={cadenceText(catalog)} /> : null} />}
      {review && (
        <ReviewSheet
          open
          basket={{ planKey: plan.planKey, interval, addons: selectionToAddons(live) }}
          planName={plan.name}
          consentText={catalog.consentText}
          onClose={() => setReview(false)}
        />
      )}
    </>
  );
}

function cadenceText(catalog: PublicCatalog): string {
  const phrases = visibleIntervals(catalog).map((i) => (i === "MONTH" ? "monthly" : intervalEvery(i)));
  return phrases.length <= 1 ? (phrases[0] ?? "monthly") : `${phrases.slice(0, -1).join(", ")} or ${phrases[phrases.length - 1]}`;
}

/** "Compare plans" built from the catalog's included lists: every service any plan includes, a check or its allowance per plan. */
function CatalogCompareDialog({ catalog, interval, open, onClose }: { catalog: PublicCatalog; interval: Interval; open: boolean; onClose: () => void }) {
  const plans = catalog.plans.filter((p) => !p.sunset);
  const rows = new Map<string, string>();
  for (const p of plans) for (const i of p.included) if (!rows.has(i.featureKey)) rows.set(i.featureKey, i.name);
  return (
    <Dialog open={open} onClose={onClose} title="Compare plans" description="Consultancy is priced per person — see its card." className="sm:max-w-2xl">
      <table className="w-full border-collapse text-[12.5px] sm:text-[13.5px]">
        <thead>
          <tr className="border-b border-line">
            <th className="py-2.5 pr-3 text-left font-semibold text-muted" scope="col">
              <span className="sr-only">Feature</span>
            </th>
            {plans.map((p) => (
              <th key={p.planKey} scope="col" className="py-2.5 text-center font-display text-[15px] font-semibold text-ink sm:text-base">
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-line">
            <th scope="row" className="py-2.5 pr-3 text-left font-normal text-ink-soft">
              Price
            </th>
            {plans.map((p) => (
              <td key={p.planKey} className="py-2.5 text-center font-medium text-ink">
                {isPaid(p) ? (p.prices[interval] ? `${money(p.prices[interval]!.amountMinor, catalog.currency)}${intervalSuffix(interval)}` : "—") : money(0, catalog.currency)}
              </td>
            ))}
          </tr>
          {[...rows.entries()].map(([key, name]) => (
            <tr key={key} className="border-b border-line last:border-0">
              <th scope="row" className="py-2.5 pr-3 text-left font-normal text-ink-soft">
                {name}
              </th>
              {plans.map((p) => {
                const hit = p.included.find((i) => i.featureKey === key);
                return (
                  <td key={p.planKey} className="py-2.5 text-center">
                    <Cell value={hit ? (hit.allowance != null ? `${hit.allowance}${hit.unit ? ` ${hit.unit}` : ""}` : true) : false} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}

/**
 * The /pricing cards generated from `GET /api/catalog/public` (K5.1; docs/subscriptions/05-customer-ux.md section 2): interval tabs from the union of
 * the paid plans' intervals, add-on rows only where a price is published for the interval, and the Total from the API. Plans the catalog does not carry
 * (Free before it is published, Autopilot, Consultancy) keep today's cards.
 */
export default function CatalogPricing({ catalog, ...viewer }: { catalog: PublicCatalog } & Viewer) {
  const intervals = visibleIntervals(catalog);
  const [interval, setInterval_] = useState<Interval>(intervals[0] ?? "MONTH");
  const [dialog, setDialog] = useState<"compare" | "consultancy" | null>(null);
  const plans = catalog.plans.filter((p) => !p.sunset);
  const keys = new Set(plans.map((p) => p.planKey.toLowerCase()));
  const yearly = plans.map((p) => p.prices.YEAR).find((p) => p?.savingsBp);
  const legacyAutopilot = !keys.has("autopilot") ? LEGACY.autopilot : null;
  const showLegacyFree = !keys.has("free");

  return (
    <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-6 pb-[70px]">
      <h2 className="text-center text-[27px] font-semibold text-ink sm:text-[34px]">Start free. Upgrade when you&apos;re ready.</h2>
      <p className="mx-auto mb-8 mt-2 max-w-[560px] text-center text-base text-muted">Autofill and tracking are free for good. Pay only for what does more of the work.</p>

      {intervals.length > 1 && (
        <div className="mb-8 flex justify-center">
          <Tabs value={interval} onValueChange={(v) => setInterval_(v as Interval)}>
            <TabList aria-label="Billing period">
              {intervals.map((i) => (
                <Tab key={i} value={i}>
                  {intervalTab(i)}
                  {i === "YEAR" && yearly?.savingsBp ? ` · save ${Math.round(yearly.savingsBp / 100)} %` : ""}
                </Tab>
              ))}
            </TabList>
          </Tabs>
        </div>
      )}

      <Grid>
        {showLegacyFree && <StaticCard offer={FREE} viewer={viewer} />}
        {plans.map((p) => (
          <CatalogPlanCard key={p.planKey} catalog={catalog} plan={p} interval={interval} viewer={viewer} featured={!!p.badge || p.planKey === "PRO"} />
        ))}
        {legacyAutopilot && <StaticCard offer={legacyAutopilot} viewer={viewer} />}
        <StaticCard offer={CONSULTANCY} viewer={viewer} onOpenOverride={() => setDialog("consultancy")} />
      </Grid>

      <div className="mt-8 flex flex-col items-center gap-4 text-center">
        <Button variant="ghost" onClick={() => setDialog("compare")}>
          Compare plans side by side
        </Button>
        <RenewalNote className="max-w-2xl" plan="Your plan" cadence={cadenceText(catalog)} />
      </div>

      {dialog === "consultancy" && <ConsultancyDialog onClose={() => setDialog(null)} />}
      <CatalogCompareDialog catalog={catalog} interval={interval} open={dialog === "compare"} onClose={() => setDialog(null)} />
    </section>
  );
}

/** A card for an offer the catalog does not carry yet: today's content, with today's buttons (Free signs up, the rest contact sales). */
function StaticCard({ offer, viewer, onOpenOverride }: { offer: Offer; viewer: Viewer; onOpenOverride?: () => void }) {
  const [open, setOpen] = useState(false);
  const action =
    offer.id === "free" ? (
      viewer.signedIn ? (
        <Link href="/dashboard" className={buttonVariants("ghost", "md", "w-full")}>
          Go to your dashboard
        </Link>
      ) : (
        <Link href="/signup" className={buttonVariants("accent", "md", "w-full")}>
          Get started free
        </Link>
      )
    ) : (
      <ContactButton offer={offer} />
    );
  return (
    <>
      <OfferCard offer={offer} onOpen={onOpenOverride ?? (() => setOpen(true))} action={action} />
      {open && <OfferDialog offer={offer} open onClose={() => setOpen(false)} footer={action} />}
    </>
  );
}
