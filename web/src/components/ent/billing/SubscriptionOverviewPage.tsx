"use client";
/* eslint-disable react-hooks/set-state-in-effect -- data loader: the effect starts a fetch and the answer is stored */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ent/shell/ShellContext";
import { DollarIcon, EmptyState, ErrorState, KeyIcon, KpiTile, ListSkeleton, ShieldIcon, StatePill, UsersIcon, buttonVariants } from "@kiwiply/ui";
import { billingApi, day, money, recurringText, STATUS_LABEL, type Overview } from "@/lib/ent/billing";
import { registerBillingStates } from "./states";

registerBillingStates();

const CARD = "rounded-[var(--radius)] border border-line bg-paper p-4";

/**
 * Subscription Overview at `/w/admin/subscription` (docs/enterprise-v2/ORG-BILLING-BUILD.md step 1a, 28 §1): the licences an organization holds,
 * what they would cost a month, the next invoice, what is ending, the contract. Read-only. Until Stripe is connected it says plainly that nothing is
 * billed yet; with no prices it says "Price not set" and never shows $0.
 */
export default function SubscriptionOverviewPage({ orgId }: { orgId: number }) {
  const [data, setData] = useState<Overview | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(null);
    const r = await billingApi.overview(orgId);
    if (r.ok) setData(r.data);
    else setFailed(r.message);
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader title="Subscription" subtitle="Your licences, what they cost each month, and what changes next." />
      <div className="space-y-4" data-subscription-page>
        {failed ? (
          <ErrorState what="your subscription" description={failed} onRetry={() => void load()} />
        ) : data == null ? (
          <ListSkeleton count={4} label="Loading your subscription" />
        ) : (
          <Body o={data} />
        )}
      </div>
    </>
  );
}

function Body({ o }: { o: Overview }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <StatePill domain="billing-state" state={o.status} label={STATUS_LABEL[o.status] ?? o.status} />
        <span className="text-[13px] text-ink-soft">
          {o.orgName ? `${o.orgName} · ` : ""}
          {o.currency}
        </span>
      </div>

      {o.status === "SETUP" ? (
        <p className="rounded-[var(--radius)] border border-line bg-paper-2/60 px-3 py-2 text-[12.5px] text-ink-soft" data-billing-setup>
          Billing is being set up{o.orgName ? ` for ${o.orgName}` : ""}. You can give licences now; nothing is billed yet.
        </p>
      ) : null}

      {o.overdue ? (
        <p role="alert" className="rounded-[var(--radius)] border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger-text" data-billing-overdue>
          {o.overdue.invoices === 1 ? "One invoice is" : `${o.overdue.invoices} invoices are`} overdue: {money(o.overdue.amountMinor, o.currency)}
          {o.overdue.oldestDueOn ? `, due since ${day(o.overdue.oldestDueOn)}` : ""}. See Billing &amp; Invoices.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile tone="blue" label="Consultants" icon={<UsersIcon />} value={o.tiles.consultants} />
        <KpiTile tone="green" label="Licensed" icon={<KeyIcon />} value={o.tiles.licensed} />
        <KpiTile tone="orange" label="Without a licence" icon={<ShieldIcon />} value={o.tiles.unlicensed} />
        <KpiTile tone="violet" label="Monthly recurring" icon={<DollarIcon />} value={<span data-billing-recurring>{recurringText(o)}</span>} />
      </div>

      {o.tiles.consultants === 0 ? (
        <EmptyState mascot title="No consultants yet" description="Add consultants first, then give them a licence. You'll see the price before anything is billed." />
      ) : null}

      <div className="grid gap-3 lg:grid-cols-3">
        <section className={CARD} aria-label="Next invoice" data-billing-next>
          <h2 className="text-[14px] font-bold text-ink">Next invoice</h2>
          {o.nextInvoiceOn ? (
            <>
              <p className="mt-2 text-[20px] font-bold tabular-nums text-ink">
                {o.nextInvoiceEstimateMinor != null ? `~${money(o.nextInvoiceEstimateMinor, o.currency)}` : "Price not set"}
              </p>
              <p className="text-[12.5px] text-ink-soft">
                on {day(o.nextInvoiceOn)}
                {o.estimate ? " · Estimate: no money moves yet" : ""}
              </p>
            </>
          ) : (
            <p className="mt-2 text-[13px] text-ink-soft">There&apos;s no invoice yet: billing isn&apos;t connected.</p>
          )}
          <p className="mt-2 text-[12px] text-muted">{o.taxNote}</p>
        </section>

        <section className={CARD} aria-label="Changes coming up" data-billing-ending>
          <h2 className="text-[14px] font-bold text-ink">Changes coming up</h2>
          {o.ending.length === 0 ? (
            <p className="mt-2 text-[13px] text-ink-soft">Nothing is ending.</p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-[13px]">
              {o.ending.map((e) => (
                <li key={`${e.consultantId}-${e.what}-${e.endsAt}`} className="flex flex-wrap justify-between gap-2">
                  <span className="text-ink">
                    {e.what === "Licence" ? "Licence ends" : `${e.what} ends`} · {e.name}
                  </span>
                  <span className="tabular-nums text-ink-soft">{day(e.endsAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={CARD} aria-label="Contract" data-billing-contract>
          <h2 className="text-[14px] font-bold text-ink">Contract</h2>
          {o.contract ? (
            <dl className="mt-2 space-y-1 text-[13px]">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-soft">Name</dt>
                <dd className="text-ink">{o.contract.name ?? "-"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-soft">Ends</dt>
                <dd className="tabular-nums text-ink">{o.contract.endsAt ? day(o.contract.endsAt) : "No end date"}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-2 text-[13px] text-ink-soft">No contract prices yet. Licences show &ldquo;Price not set&rdquo; until Kiwiply adds them.</p>
          )}
        </section>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/w/admin/licenses" className={buttonVariants("accent", "md")} data-billing-manage>
          Manage licences
        </Link>
        <Link href="/w/admin/usage" className={buttonVariants("ghost", "md")}>
          Feature usage
        </Link>
        <Link href="/w/admin/billing" className={buttonVariants("ghost", "md")}>
          Billing &amp; invoices
        </Link>
      </div>
    </>
  );
}
