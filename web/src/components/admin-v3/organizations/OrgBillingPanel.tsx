"use client";
/* eslint-disable react-hooks/set-state-in-effect -- data loader: the effect starts a fetch and the answer is stored */

import { useCallback, useEffect, useState } from "react";
import { Button, Input, Switch, Textarea } from "@kiwiply/ui";
import { AdminPanel, StatusDot } from "../common";
import { adminFetch } from "@/lib/admin-client";
import { SETUP_FEE_LABEL, feeText, type OrgBilling } from "@/lib/admin-orgs";

const day = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "-";

/**
 * Billing on the organization's admin page (docs/enterprise-v2/ORG-BILLING-BUILD.md step 2; user decision 2026-11-12: the platform admin starts billing).
 * Before: a short form (billing email, waive the setup fee, reason). After: the billing account, the current period, whether Stripe bills it, and the
 * setup fee. An organization that existed before setup fees is never charged one. Nothing is charged while Stripe is off.
 */
export default function OrgBillingPanel({ orgId, orgName }: { orgId: number; orgName: string }) {
  const [billing, setBilling] = useState<OrgBilling | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [waive, setWaive] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await adminFetch<OrgBilling>("GET", `/orgs/${orgId}/billing`);
    if (res.ok) {
      setBilling(res.data);
      setFailed(null);
    } else setFailed(res.error);
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function start(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    const res = await adminFetch<OrgBilling>("POST", `/orgs/${orgId}/billing/start`, { billingEmail: email.trim(), waiveSetupFee: waive, reason: reason.trim() });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setBilling(res.data);
  }

  const a = billing?.account ?? null;
  return (
    <AdminPanel title="Billing" description="The organization's billing account. You start it; its admins then see invoices and, once Stripe bills them, the billing portal." >
      <div data-admin-billing={orgId}>
        {failed ? (
          <p role="alert" className="text-[13px] text-danger-text">
            Couldn&apos;t load billing: {failed}{" "}
            <button type="button" className="font-semibold underline" onClick={() => void load()}>
              Try again
            </button>
          </p>
        ) : billing == null ? (
          <p className="text-[13px] text-v2-muted">Loading billing…</p>
        ) : a ? (
          <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2" data-billing-started>
            <Item label="Status">
              <StatusDot status={a.source === "STRIPE" ? "Billed by Stripe" : "Local: nothing is charged"} tone={a.source === "STRIPE" ? "green" : "slate"} />
            </Item>
            <Item label="Billing email">{a.billingEmail}</Item>
            <Item label="Current period">
              {day(a.periodStart)} to {day(a.periodEnd)}
            </Item>
            <Item label="Invoices">Sent each period, paid within 15 days ({a.currency})</Item>
            <Item label="Setup fee">
              <span data-setup-fee={a.setupFee?.status ?? "NONE"}>
                {a.setupFee ? SETUP_FEE_LABEL[a.setupFee.status] ?? a.setupFee.status : "-"}
                {a.setupFee && a.setupFee.status !== "WAIVED" ? ` · ${feeText(a.setupFee.amountMinor)}` : ""}
              </span>
              {a.setupFee?.note && <span className="block text-[12px] text-v2-muted">{a.setupFee.note}</span>}
            </Item>
            <Item label="Started">
              {day(a.startedAt)}
              {a.startedBy ? ` by ${a.startedBy}` : ""}
            </Item>
          </dl>
        ) : (
          <form onSubmit={start} className="space-y-3" noValidate data-billing-start-form>
            <p className="text-[13px] leading-snug text-ink-soft">
              Billing hasn&apos;t started for {orgName}. Starting opens its first billing period today (to the end of the month) and sends invoices each period, paid within 15 days.{" "}
              {billing.stripeReady ? "Stripe is on: a Stripe customer is created for the organization." : "Stripe is off: billing stays local and nothing is charged."}
            </p>
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-semibold text-ink">Billing email</span>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="accounts@company.com" autoComplete="off" aria-label="Billing email" />
            </label>
            {billing.setupFeeExempt ? (
              <p className="text-[12.5px] text-v2-muted" data-fee-exempt>
                No setup fee: this organization existed before setup fees.
              </p>
            ) : (
              <div className="space-y-1">
                <Switch checked={waive} onCheckedChange={setWaive} label="Waive the setup fee" description={`Otherwise it goes on the first invoice: ${feeText(billing.setupFeePriceMinor)}.`} aria-label="Waive the setup fee" />
              </div>
            )}
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-semibold text-ink">Reason</span>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="e.g. Order form signed on Nov 10" aria-label="Reason" />
            </label>
            {error && (
              <p role="alert" className="text-[12.5px] text-danger-text">
                {error}
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit" variant="primary" disabled={busy || !email.trim() || reason.trim().length < 3} className="min-h-11 sm:min-h-0" data-billing-start>
                {busy ? "Starting…" : "Start billing"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </AdminPanel>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] font-semibold text-v2-muted">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}
