"use client";

import { useCallback, useId, useRef, useState } from "react";
import Link from "next/link";
import { CheckIcon, MoneyText, XIcon, useBottomBar, useMediaQuery, useToast } from "@kiwiply/ui";
import { Button, Card, Skeleton } from "@/components/ui";
import ImpactPreview from "@/components/billing/ImpactPreview";
import ManageBillingButton from "@/components/billing/ManageBillingButton";
import ResponsiveSheet from "@/components/billing/ResponsiveSheet";
import { chooseRetirement, confirmQuote, createQuote, getRetirement, newIdempotencyKey } from "@/lib/subscription/client";
import { intervalSuffix, money, problemCopy, shortDate } from "@/lib/subscription/copy";
import { COPY, choiceProblemCopy, decisionLine, defaultLine, isDearer, suggestLine, type RetirementChoice, type RetirementMe, type RetirementOther } from "@/lib/subscription/retirement";
import type { PlanQuote } from "@/lib/subscription/types";

/**
 * "Your plan is changing" (docs/subscriptions/11-plan-retirement.md section 12; K10.10): what the subscriber uses, what we suggest, the other
 * options, and plainly what happens if they do nothing. The two switch buttons are never pre-selected: an equal or lower price shows one primary
 * "Switch at renewal — free"; a higher price shows "Switch now" with what is charged today and "Switch at renewal" with the new price and its date, side
 * by side, neither first-among-equals. Every amount and date is an API field; the browser only formats. A choice can be changed until the date.
 */
export default function PlanChangingPage({ initial }: { initial: RetirementMe }) {
  const toast = useToast();
  const [data, setData] = useState<RetirementMe>(initial);
  const [busy, setBusy] = useState<RetirementChoice | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [other, setOther] = useState<{ planKey: string; quote: PlanQuote | null; loading: boolean; error: string | null } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const desktop = useMediaQuery("(min-width: 1024px)", true);
  const barRef = useRef<HTMLDivElement>(null);
  useBottomBar(barRef);
  const keyRef = useRef<{ what: string; key: string } | null>(null);
  const dateId = useId();

  const n = data.retirement;

  const refresh = useCallback(async () => {
    const res = await getRetirement();
    if (res.ok) setData(res.data);
  }, []);

  async function choose(choice: RetirementChoice, quoteId?: number) {
    const what = `${choice}:${quoteId ?? ""}`;
    const key = keyRef.current?.what === what ? keyRef.current.key : newIdempotencyKey();
    keyRef.current = { what, key };
    setBusy(choice);
    setProblem(null);
    const res = await chooseRetirement(choice, key, quoteId);
    setBusy(null);
    if (res.ok) {
      keyRef.current = null;
      setData(res.data);
      toast({ title: "Saved", description: "You can change this any time before the date.", variant: "success" });
      return;
    }
    setProblem(choiceProblemCopy(res.problem.code));
  }

  async function seeQuote(o: RetirementOther) {
    if (!n) return;
    setOther({ planKey: o.planKey, quote: null, loading: true, error: null });
    const res = await createQuote({ kind: "CHANGE", planKey: o.planKey, interval: o.interval, addons: [] });
    if (res.ok) setOther({ planKey: o.planKey, quote: res.data, loading: false, error: null });
    else setOther({ planKey: o.planKey, quote: null, loading: false, error: problemCopy(res.problem.code) });
  }

  async function confirmOther() {
    const q = other?.quote;
    if (!q) return;
    setConfirming(true);
    const key = keyRef.current?.what === `Q${q.quoteId}` ? keyRef.current.key : newIdempotencyKey();
    keyRef.current = { what: `Q${q.quoteId}`, key };
    const res = await confirmQuote(q.quoteId, key);
    setConfirming(false);
    if (res.ok) {
      keyRef.current = null;
      setOther(null);
      toast({ title: "Plan updated", variant: "success" });
      await refresh();
      return;
    }
    setOther((o) => (o ? { ...o, error: problemCopy(res.problem.code) } : o));
  }

  if (!n) {
    return (
      <Card className="flex flex-col gap-3" data-testid="nothing-changing">
        <p className="font-display text-lg font-semibold text-ink">Nothing is changing on your plan.</p>
        <p className="text-sm text-muted">If your plan is ever retired, this page shows your options with the date, well before anything happens.</p>
        <Link href="/settings/plan" className="inline-flex min-h-11 items-center text-sm font-semibold text-ink underline sm:min-h-0">
          Back to My plan
        </Link>
      </Card>
    );
  }

  const date = shortDate(n.effectiveAt);
  const s = n.suggestion;
  const dearer = !!s && isDearer(s);
  const decided = n.decision.status !== "PENDING";
  const decision = decisionLine(n);
  const unlockedCount = n.fallback.locked.length;

  const equalCta = s ? (
    <Button variant="accent" disabled={busy !== null} aria-describedby={dateId} onClick={() => void choose("SWITCH_AT_RENEWAL", s.atRenewalQuoteId)}>
      Switch at renewal — free
    </Button>
  ) : null;

  return (
    <div className="flex flex-col gap-5" data-testid="plan-changing">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-2xl font-bold text-ink" data-testid="changing-title">
          {COPY.title(n.planName, n.effectiveAt)}
        </h2>
        <p className="text-sm text-muted">{COPY.intro(n.effectiveAt)}</p>
        {n.lastDay ? <p className="text-sm font-semibold text-ink">{COPY.lastDay}</p> : null}
      </header>

      {decision ? (
        <Card className="border-line bg-accent-soft" data-testid="decision-line">
          <p role="status" className="text-[14px] text-ink">
            {decision}
          </p>
        </Card>
      ) : null}

      {problem ? (
        <p role="alert" className="text-[13px] text-danger-text" data-testid="choice-problem">
          {problem}
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card className="flex flex-col gap-2">
          <details open={desktop} className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-display text-lg font-semibold text-ink sm:min-h-0 lg:pointer-events-none">
              What you use
              <span className="text-[12px] font-normal text-muted lg:hidden">tap to {desktop ? "hide" : "show"}</span>
            </summary>
            <ul className="mt-2 flex flex-col gap-1.5 text-[14px]" data-testid="uses">
              {n.uses.map((u) => (
                <li key={u.featureKey} className="flex items-start gap-2">
                  <span className="mt-0.5 flex-none text-muted">{u.covered ? <CheckIcon size={15} aria-label="included in the suggestion" /> : <XIcon size={15} aria-label="not included in the suggestion" />}</span>
                  <span className="text-ink">
                    {u.name}
                    {u.detail ? <span className="text-muted"> ({u.detail})</span> : null}
                  </span>
                </li>
              ))}
              {n.uses.length === 0 ? <li className="text-muted">You haven&apos;t used the paid services lately.</li> : null}
            </ul>
          </details>
        </Card>

        <Card className="flex flex-col gap-3" data-testid="suggestion">
          {s ? (
            <>
              <p className="font-display text-lg font-semibold text-ink">Suggested: {s.successorName}</p>
              <p className="text-[14px] text-ink-soft">{suggestLine(s)}</p>
              <p className="text-[14px] text-ink" data-testid="price-line">
                <MoneyText minor={s.currentMinor} currency={s.currency} />
                {intervalSuffix(s.interval)} → <MoneyText minor={s.proposedMinor} currency={s.currency} />
                {intervalSuffix(s.interval)}
              </p>
              {s.annualAlternative ? (
                <p className="text-[13px] text-muted">
                  Yearly: {money(s.annualAlternative.proposedMinor, s.currency)} once a year · save {money(s.annualAlternative.savingsMinor, s.currency)}
                </p>
              ) : null}
              <p id={dateId} className="text-[12.5px] text-muted">
                {dearer ? `Switching at renewal starts on ${date}.` : `Takes effect on ${date}. Nothing is charged today.`}
              </p>
              {dearer ? (
                <div className="flex flex-col gap-2 sm:flex-row" role="group" aria-label="How to switch">
                  <Button variant="ghost" className="border border-line" disabled={busy !== null} aria-describedby={dateId} onClick={() => void choose("SWITCH_NOW", s.nowQuoteId ?? s.atRenewalQuoteId)}>
                    Switch now · {money(s.nowTodayMinor ?? s.proposedMinor, s.currency)} today (prorated)
                  </Button>
                  <Button variant="ghost" className="border border-line" disabled={busy !== null} aria-describedby={dateId} onClick={() => void choose("SWITCH_AT_RENEWAL", s.atRenewalQuoteId)}>
                    Switch at renewal · {money(s.proposedMinor, s.currency)}
                    {intervalSuffix(s.interval)} from {date}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">{equalCta}</div>
              )}
              {dearer ? <p className="text-[12.5px] text-muted">A higher price only ever happens with your say-so. No refunds for partial periods.</p> : null}
            </>
          ) : (
            <>
              <p className="font-display text-lg font-semibold text-ink">No closest match</p>
              <p className="text-[14px] text-ink-soft">We couldn&apos;t find one plan that covers what you use. Look at the other options, or stay on Free.</p>
            </>
          )}
        </Card>

        <Card className="flex flex-col gap-3" data-testid="other-options">
          <p className="font-display text-lg font-semibold text-ink">Other options</p>
          <ul className="flex flex-col gap-2">
            {n.others.map((o) => (
              <li key={o.planKey} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[14px] text-ink">
                  {o.name} <span className="text-muted">{money(o.priceMinor, o.currency)}{intervalSuffix(o.interval)}</span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => void seeQuote(o)} aria-label={`See quote for ${o.name}`}>
                  See quote
                </Button>
              </li>
            ))}
          </ul>
          <div className="mt-1 border-t border-line pt-3">
            <p className="text-[14px] font-semibold text-ink">Stay on Free from {date}</p>
            <p className="mt-1 text-[13px] text-muted" data-testid="free-lock-preview">
              {n.fallback.readOnlyResumes ? `${n.fallback.readOnlyResumes} resumes become read-only. ` : ""}
              {unlockedCount > 0 ? `${n.fallback.locked.map((l) => l.name).join(", ")} become read-only until you pick a plan.` : "Nothing you use becomes read-only."}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" className="border border-line" disabled={busy !== null || n.decision.status === "STAY_ON_FREE"} onClick={() => void choose("STAY_ON_FREE")}>
                Move to Free on {date}
              </Button>
              <Link href="/settings/plan" className="inline-flex min-h-11 items-center px-2 text-[13.5px] font-semibold text-ink underline sm:min-h-0">
                I&apos;ll decide later
              </Link>
            </div>
          </div>
        </Card>
      </div>

      <Card className="flex flex-col gap-2" data-testid="do-nothing">
        <p className="font-display text-lg font-semibold text-ink">If you do nothing</p>
        <p className="text-[14px] text-ink-soft">{defaultLine(n)}</p>
        <p className="text-[13px] text-muted">
          You keep your paid time and your data either way: nothing is deleted, and downloading your data always works.{" "}
          <a href="/api/account/export" className="font-semibold text-ink underline" download>
            Download my data
          </a>
        </p>
        <div className="mt-1 flex flex-col items-start gap-1">
          <ManageBillingButton label="Cancel plan instead" />
          <p className="text-[12.5px] text-muted">{COPY.cancel(n.planName, n.effectiveAt)}</p>
        </div>
      </Card>

      {!desktop && s && !dearer && !decided ? (
        <div ref={barRef} className="sticky bottom-0 z-20 -mx-4 flex items-center justify-between gap-3 border-t border-line bg-paper px-4 py-3" data-testid="sticky-bar">
          <span className="text-[13px] text-ink">Takes effect {date}</span>
          <Button variant="accent" size="sm" disabled={busy !== null} onClick={() => void choose("SWITCH_AT_RENEWAL", s.atRenewalQuoteId)}>
            Switch at renewal — free
          </Button>
        </div>
      ) : null}

      <ResponsiveSheet
        open={other !== null}
        onClose={() => setOther(null)}
        id="retirement-other-quote"
        title={other ? `Switch to ${n.others.find((o) => o.planKey === other.planKey)?.name ?? other.planKey}` : "Quote"}
        description={`Your current plan stays until ${date} unless this takes effect sooner.`}
      >
        {other?.loading ? <Skeleton className="h-24" /> : null}
        {other?.error ? (
          <p role="alert" className="text-[13px] text-danger-text">
            {other.error}
          </p>
        ) : null}
        {other?.quote ? <ImpactPreview quote={other.quote} names={{}} confirming={confirming} onConfirm={() => void confirmOther()} onConfirmDep={() => undefined} confirmedDeps={[]} fromPlanKey={n.planKey} /> : null}
      </ResponsiveSheet>
    </div>
  );
}
