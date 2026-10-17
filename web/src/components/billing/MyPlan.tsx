"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FeatureChip, PriceDelta, StatePill, Tab, TabList, Tabs, useBottomBar, useMediaQuery, useToast } from "@kiwiply/ui";
import { Button, Card, Skeleton } from "@/components/ui";
import AddonSteppers, { type AddonRow } from "@/components/billing/AddonSteppers";
import ImpactPreview from "@/components/billing/ImpactPreview";
import InvoiceList from "@/components/billing/InvoiceList";
import LockedServices from "@/components/billing/LockedServices";
import ManageBillingButton from "@/components/billing/ManageBillingButton";
import PlanMeters from "@/components/billing/PlanMeters";
import ResponsiveSheet from "@/components/billing/ResponsiveSheet";
import { confirmQuote, createQuote, getEntitlements, getInvoices, getMyPlan, getPublicCatalog, newIdempotencyKey, undoChange } from "@/lib/subscription/client";
import { intervalSuffix, intervalTab, money, problemCopy, shortDate } from "@/lib/subscription/copy";
import { carryAddons, changeProblemCopy, changeRequest, currentTarget, offerableAddons, pendingFor, sameTarget, type Target } from "@/lib/subscription/plan-state";
import { COPY } from "@/lib/subscription/retirement";
import type { EntitlementSet, Interval, Invoice, PendingChange, PlanQuote, PlanV3, PublicCatalog } from "@/lib/subscription/types";

type Phase = "idle" | "loading" | "ready" | "error";
type Problem = { code?: string; text: string };

const PER: Record<Interval, string> = { MONTH: "mo", QUARTER: "3 mo", YEAR: "yr" };

/**
 * My plan (docs/subscriptions/05-customer-ux.md section 4): the plan card with its version, add-on steppers, the interval and the plan switch, the
 * impact preview of whatever is pending, usage meters and invoices. The controls never change anything: they build a pending change set, a CHANGE quote
 * prices it (debounced), and only Confirm (with an Idempotency-Key) applies it. A removal says "works until {date} - no refund" at the stepper and can be
 * taken back from the toast or the row. Every figure comes from the API; nothing is added here.
 */
export default function MyPlan({ initialPlan }: { initialPlan: PlanV3 }) {
  const toast = useToast();
  const [plan, setPlan] = useState<PlanV3>(initialPlan);
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);
  const [ent, setEnt] = useState<EntitlementSet | null | "error">(null);
  const [invoices, setInvoices] = useState<Invoice[] | null | "error">(null);

  const current = useMemo(() => currentTarget(plan), [plan]);
  const currentKey = JSON.stringify(current);
  const [target, setTarget] = useState<Target | null>(current);
  const [confirmedDeps, setConfirmedDeps] = useState<string[]>([]);
  // the answer to the latest quote request, tagged with the request it answers so an old answer is never shown for a newer change set
  const [result, setResult] = useState<{ key: string; quote: PlanQuote | null; problem: Problem | null } | null>(null);
  const [actionProblem, setActionProblem] = useState<(Problem & { key: string }) | null>(null);
  const [seenPlanKey, setSeenPlanKey] = useState(currentKey);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [undoing, setUndoing] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const desktop = useMediaQuery("(min-width: 1024px)", true);
  const keyRef = useRef<{ quoteId: number; key: string } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  useBottomBar(barRef);

  const refresh = useCallback(async () => {
    const [p, e, i] = await Promise.all([getMyPlan(), getEntitlements(), getInvoices()]);
    if (p.ok) setPlan(p.data);
    setEnt(e.ok ? e.data : "error");
    setInvoices(i.ok ? i.data : "error");
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [c, e, i] = await Promise.all([getPublicCatalog(), getEntitlements(), getInvoices()]);
      if (cancelled) return;
      setCatalog(c.ok ? c.data : null);
      setEnt(e.ok ? e.data : "error");
      setInvoices(i.ok ? i.data : "error");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // a refreshed plan resets the pending change set to what is now held (adjusted while rendering, not in an effect)
  if (seenPlanKey !== currentKey) {
    setSeenPlanKey(currentKey);
    setTarget(current);
    setConfirmedDeps([]);
    setResult(null);
    setActionProblem(null);
  }

  const targetKey = JSON.stringify(target);
  const depsKey = confirmedDeps.join(",");
  const dirty = !!target && !!current && !sameTarget(target, current);
  const requestKey = `${currentKey}|${targetKey}|${depsKey}|${tick}`;

  // the pending change set -> a CHANGE quote, debounced 400 ms
  useEffect(() => {
    if (!target || !current || !dirty) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const res = await createQuote({ ...changeRequest(target, current), confirmedCommercialDeps: confirmedDeps });
      if (cancelled) return;
      if (res.ok) {
        setResult({ key: requestKey, quote: res.data, problem: null });
        return;
      }
      const special = changeProblemCopy(res.problem.code, { max: res.problem.max });
      setResult({
        key: requestKey,
        quote: null,
        problem: special === null ? null : { code: res.problem.code, text: special ?? problemCopy(res.problem.code, { max: res.problem.max }) },
      });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // the request key already covers target, current, deps and tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const fresh = dirty && result?.key === requestKey ? result : null;
  const quote = fresh?.quote ?? null;
  const problem: Problem | null = (actionProblem?.key === requestKey ? actionProblem : null) ?? fresh?.problem ?? null;
  const phase: Phase = !dirty ? "idle" : !fresh ? "loading" : quote ? "ready" : problem ? "error" : "idle";

  const catalogPlan = catalog?.plans.find((p) => p.planKey === target?.planKey);
  const names = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of plan.addons ?? []) m[a.featureKey] = a.name;
    for (const p of catalog?.plans ?? []) for (const o of p.optional) m[o.featureKey] = o.name;
    return m;
  }, [plan, catalog]);

  const rows: AddonRow[] = useMemo(() => {
    if (!target || !current) return [];
    const out = new Map<string, AddonRow>();
    for (const a of plan.addons ?? []) {
      const pending = pendingFor(plan, a.featureKey);
      out.set(a.featureKey, {
        featureKey: a.featureKey,
        name: a.name,
        quantity: target.addons[a.featureKey] ?? 0,
        held: current.addons[a.featureKey] ?? 0,
        unitMinor: a.unitMinor ?? null,
        max: catalogPlan?.optional.find((o) => o.featureKey === a.featureKey)?.maxQuantity ?? 10,
        pending,
      });
    }
    for (const o of offerableAddons(catalogPlan, target.interval)) {
      if (out.has(o.featureKey)) continue;
      out.set(o.featureKey, {
        featureKey: o.featureKey,
        name: o.name,
        quantity: target.addons[o.featureKey] ?? 0,
        held: 0,
        unitMinor: o.prices[target.interval]?.amountMinor ?? null,
        max: o.maxQuantity ?? 10,
      });
    }
    return [...out.values()];
  }, [target, current, plan, catalogPlan]);

  function setQty(featureKey: string, quantity: number) {
    setTarget((t) => (t ? { ...t, addons: { ...t.addons, [featureKey]: Math.max(0, quantity) } } : t));
    setConfirmedDeps([]);
    setNotice(null);
  }

  function setInterval_(interval: Interval) {
    setTarget((t) => (t ? { ...t, interval } : t));
    setConfirmedDeps([]);
    setNotice(null);
  }

  function chooseSwitch(planKey: string) {
    if (!target) return;
    const next = catalog?.plans.find((p) => p.planKey === planKey);
    const { kept, dropped } = carryAddons(target.addons, next, target.interval);
    setTarget({ planKey, interval: target.interval, addons: kept });
    setConfirmedDeps([]);
    setNotice(dropped.length > 0 ? `${dropped.map((k) => names[k] ?? k).join(", ")} ${dropped.length > 1 ? "aren't" : "isn't"} part of ${next?.name ?? planKey} and won't carry over.` : null);
    setSwitchOpen(false);
  }

  async function undo(change: PendingChange) {
    setUndoing(change.id);
    const res = await undoChange(change.id);
    setUndoing(null);
    if (res.ok) {
      toast({ title: "Removal undone", description: "Your add-on stays.", variant: "success" });
      await refresh();
    } else {
      toast({ title: problemCopy(res.problem.code), variant: "error" });
    }
  }

  async function confirm() {
    if (!quote) return;
    setConfirming(true);
    const key = keyRef.current?.quoteId === quote.quoteId ? keyRef.current.key : newIdempotencyKey();
    keyRef.current = { quoteId: quote.quoteId, key };
    const res = await confirmQuote(quote.quoteId, key, confirmedDeps);
    setConfirming(false);
    if (res.ok) {
      const batch = res.data;
      const removals = batch.changes.filter((c) => c.status === "PENDING" && (c.kind === "REMOVE" || c.kind === "DECREASE") && c.featureKey);
      const added = batch.changes.some((c) => c.status !== "PENDING" && (c.kind === "ADD" || c.kind === "INCREASE" || c.kind === "PLAN_SWITCH"));
      setReviewOpen(false);
      toast({
        title: "Plan updated",
        description: added ? "What you added was charged, so it can't be undone. Removals can." : removals.length > 0 ? "Your removal takes effect at the end of the period." : undefined,
        variant: "success",
        duration: removals.length > 0 ? 8000 : 4000,
        action:
          removals.length > 0
            ? {
                label: "Undo removal",
                onClick: () => {
                  void (async () => {
                    let failed = false;
                    for (const c of removals) {
                      const r = await undoChange(c.id);
                      if (!r.ok) failed = true;
                    }
                    toast(failed ? { title: "Couldn't undo that", description: "It may have already taken effect.", variant: "error" } : { title: "Removal undone", variant: "success" });
                    await refresh();
                  })();
                },
              }
            : undefined,
      });
      await refresh();
      return;
    }
    const code = res.problem.code;
    if (code === "QUOTE_STALE" || code === "QUOTE_EXPIRED") {
      setNotice(problemCopy(code));
      keyRef.current = null;
      // re-quote the same target (what was dialled in stays): the tick re-runs the quote effect
      setTick((n) => n + 1);
      return;
    }
    setActionProblem({ key: requestKey, code, text: problemCopy(code) });
  }

  // ---- Free / not linked ------------------------------------------------------------------------------------------------------------

  if (!current) {
    const isPro = plan.plan === "PRO";
    return (
      <div className="flex flex-col gap-5" data-testid="my-plan-free">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-display text-xl font-semibold text-ink">{isPro ? "Pro" : "Free"}</p>
              <p className="mt-1 text-sm text-muted">
                {isPro
                  ? "Your subscription isn't linked to a plan with add-ons yet. Manage it from billing."
                  : "Unlimited autofill, resume parsing and tracker. Upgrade any time for AI help."}
              </p>
            </div>
            {isPro ? <ManageBillingButton /> : plan.billingEnabled ? <Link href="/pricing" className="inline-flex items-center rounded-full bg-accent px-5 py-[11px] text-sm font-semibold text-on-accent">See plans</Link> : null}
          </div>
        </Card>
        <LockedServices ent={ent} />
        <p className="text-[12.5px] text-muted">No refunds for partial periods. Cancel any time, one tap.</p>
      </div>
    );
  }

  // ---- subscribed -------------------------------------------------------------------------------------------------------------------

  const state = plan.cancelAtPeriodEnd ? "CANCEL_AT_PERIOD_END" : plan.status === "past_due" ? "PAST_DUE" : "ACTIVE";
  const interval = current.interval;
  const planFeatures = ent && ent !== "error" ? ent.features.filter((f) => f.source === "PLAN") : [];
  const switchTargets = (catalog?.plans ?? []).filter((p) => p.planKey !== current.planKey && !p.sunset && Object.keys(p.prices).length > 0);
  const offeredIntervals: Interval[] = (() => {
    const base = (catalogPlan?.intervals ?? []).filter((i) => i !== "YEAR" || catalog?.annualEnabled || interval === "YEAR");
    return base.includes(interval) ? base : [interval, ...base];
  })();

  const preview = quote ? (
    <ImpactPreview
      quote={quote}
      names={names}
      confirming={confirming}
      onConfirm={confirm}
      onConfirmDep={(requires) => setConfirmedDeps((d) => (d.includes(requires) ? d : [...d, requires]))}
      confirmedDeps={confirmedDeps}
      fromPlanKey={current.planKey}
    />
  ) : null;

  const previewPanel =
    dirty && (phase !== "idle" || problem) ? (
      <Card className="flex flex-col gap-2" aria-label="Impact preview">
        <p className="text-[11.5px] font-bold uppercase tracking-[.08em] text-muted">Impact preview</p>
        {phase === "loading" && !quote ? <Skeleton className="h-24" /> : null}
        {problem ? (
          <div role="alert" className="text-[13px] text-danger-text" data-testid="change-problem">
            <p>{problem.text}</p>
            {problem.code === "CANCEL_PENDING" || problem.code === "PLAN_SWITCH_UNSUPPORTED" ? (
              <div className="mt-2">
                <ManageBillingButton />
              </div>
            ) : null}
          </div>
        ) : null}
        {preview}
      </Card>
    ) : null;

  return (
    <div className="flex flex-col gap-5" data-testid="my-plan">
      {plan.retirement ? (
        <Card className="border-brown bg-brown-soft" data-testid="retirement-notice">
          <p className="text-sm text-brown-deep">
            {COPY.banner(plan.retirement.planName, plan.retirement.effectiveAt)}. You keep everything until then.{" "}
            <Link href="/settings/plan/changing" className="font-semibold underline">
              {plan.retirement.decided ? "Review your choice" : COPY.bannerCta}
            </Link>
          </p>
        </Card>
      ) : plan.sunset ? (
        <Card className="border-brown bg-brown-soft" data-testid="sunset-banner">
          <p className="text-sm text-brown-deep">
            {plan.planName} v{plan.planVersion} is no longer offered. You keep it while you stay subscribed.{" "}
            <Link href="/pricing" className="font-semibold underline">
              See what {plan.sunset.successorPlanKey ?? "the current plan"} offers
            </Link>
          </p>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <Card className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-display text-xl font-semibold text-ink" data-testid="plan-name">
                  {plan.planName} · {intervalTab(interval).toLowerCase()}
                </p>
                <p className="text-[12.5px] text-muted">
                  {plan.planName} v{plan.planVersion} (you keep this version)
                </p>
              </div>
              <StatePill domain="billing" state={state} />
            </div>
            <p className="text-[14px] text-ink-soft" data-testid="renews-line">
              {plan.cancelAtPeriodEnd
                ? `Cancels on ${shortDate(plan.currentPeriodEnd)}. You keep ${plan.planName} until then.`
                : `Renews ${shortDate(plan.currentPeriodEnd)}${plan.recurringMinor != null ? ` · ${money(plan.recurringMinor, plan.currency ?? "USD")}${intervalSuffix(interval)}` : ""}`}
            </p>
            {plan.status === "past_due" ? (
              <p className="rounded-lg border border-line bg-paper-2 px-3 py-2 text-[12.5px] text-ink-soft">
                Your last payment didn&apos;t go through. You still have {plan.planName} while we retry. Updating your card in Manage card is the quickest fix.
              </p>
            ) : null}

            {planFeatures.length > 0 ? (
              <div className="flex flex-wrap gap-1.5" aria-label="Included in your plan">
                {planFeatures.map((f) => (
                  <FeatureChip key={f.featureKey} name={f.name} allowance={f.allowance != null ? `${f.allowance} a period` : undefined} />
                ))}
              </div>
            ) : null}

            <div>
              <p className="text-[11.5px] font-bold uppercase tracking-[.08em] text-muted">Add-ons</p>
              <AddonSteppers rows={rows} interval={target?.interval ?? interval} currency={plan.currency ?? "USD"} onChange={setQty} onUndo={undo} undoing={undoing} />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11.5px] font-bold uppercase tracking-[.08em] text-muted">Billing period</p>
                <Tabs value={target?.interval ?? interval} onValueChange={(v) => setInterval_(v as Interval)} className="mt-1">
                  <TabList aria-label="Billing period">
                    {offeredIntervals.map((i) => (
                      <Tab key={i} value={i}>
                        {intervalTab(i)}
                      </Tab>
                    ))}
                  </TabList>
                </Tabs>
              </div>
              {switchTargets.length > 0 ? (
                <Button variant="ghost" onClick={() => setSwitchOpen(true)}>
                  Switch plan...
                </Button>
              ) : null}
            </div>
            {notice ? (
              <p role="status" className="text-[12.5px] text-ink-soft" data-testid="plan-notice">
                {notice}
              </p>
            ) : null}
          </Card>

          {desktop ? previewPanel : null}
        </div>

        <div className="flex flex-col gap-5">
          <Card className="flex flex-col gap-3">
            <p className="font-display text-lg font-semibold text-ink">Usage this period</p>
            <PlanMeters ent={ent} />
          </Card>
          <Card className="flex flex-col gap-3">
            <p className="font-display text-lg font-semibold text-ink">Billing</p>
            <div className="flex flex-wrap gap-2">
              <ManageBillingButton label="Manage card" />
              <ManageBillingButton label={plan.cancelAtPeriodEnd ? "Resume or change" : "Cancel plan"} />
            </div>
            <p className="text-[12.5px] text-muted">Cancel any time, one tap. You keep your plan to the end of the period you paid for. No refunds for partial periods.</p>
          </Card>
        </div>
      </div>

      <LockedServices ent={ent} />

      <Card className="flex flex-col gap-3">
        <p className="font-display text-lg font-semibold text-ink">Invoices</p>
        <InvoiceList invoices={invoices} />
      </Card>

      {!desktop && dirty && quote ? (
        <div ref={barRef} className="sticky bottom-0 z-20 -mx-4 flex items-center justify-between gap-3 border-t border-line bg-paper px-4 py-3" data-testid="sticky-bar">
          <span className="text-[13px] text-ink">
            Proposed {money(quote.proposed.recurringMinor, quote.currency)}
            {intervalSuffix(quote.interval)} <PriceDelta minor={quote.deltaMinor} currency={quote.currency} per={PER[quote.intervalChange?.from ?? quote.interval]} />
          </span>
          <Button variant="accent" size="sm" onClick={() => setReviewOpen(true)}>
            Review
          </Button>
        </div>
      ) : null}
      {!desktop && dirty && !quote && problem ? (
        <div ref={barRef} className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-paper px-4 py-3 text-[13px] text-danger-text" role="alert">
          {problem.text}
        </div>
      ) : null}

      {!desktop ? (
        <ResponsiveSheet open={reviewOpen && !!quote} onClose={() => setReviewOpen(false)} id="change-review" title="Review your change">
          {preview}
        </ResponsiveSheet>
      ) : null}

      <ResponsiveSheet open={switchOpen} onClose={() => setSwitchOpen(false)} id="plan-switch" title="Switch plan" description="Upgrades start now and are prorated. Downgrades start at your next renewal.">
        <ul className="flex flex-col gap-2" data-testid="switch-options">
          {switchTargets.map((p) => {
            const price = p.prices[interval];
            return (
              <li key={p.planKey} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5">
                <div>
                  <p className="text-[14px] font-semibold text-ink">{p.name}</p>
                  <p className="text-[12.5px] text-muted">{price ? `${money(price.amountMinor, catalog?.currency ?? "USD")}${intervalSuffix(interval)}` : `Not available ${intervalTab(interval).toLowerCase()}`}</p>
                </div>
                <Button variant="ghost" size="sm" disabled={!price} onClick={() => chooseSwitch(p.planKey)}>
                  Preview switch
                </Button>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-[12px] text-muted">Nothing changes until you confirm. No refunds for partial periods.</p>
      </ResponsiveSheet>
    </div>
  );
}
