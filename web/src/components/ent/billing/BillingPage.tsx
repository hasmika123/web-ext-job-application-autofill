"use client";
/* eslint-disable react-hooks/set-state-in-effect -- data loaders: each effect starts a fetch and the answer is stored */

import { Fragment, useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ent/shell/ShellContext";
import { Button, buttonVariants, EmptyState, ErrorState, ListSkeleton, Select, StatePill, Tab, TabList, TabPanel, TableSkeleton, Tabs } from "@kiwiply/ui";
import {
  INVOICE_STATUS_LABEL,
  LINE_KIND_LABEL,
  STATUS_LABEL,
  billingApi,
  collectionText,
  day,
  methodText,
  money,
  setupFeeText,
  type Billing,
  type InvoiceDetail,
  type InvoicePage,
  type InvoiceRow,
} from "@/lib/ent/billing";
import { registerBillingStates } from "./states";

registerBillingStates();

const CARD = "rounded-[var(--radius)] border border-line bg-paper p-4";
const HEAD = "px-3 py-2.5 text-left text-[12px] font-semibold text-ink-soft";
const STATUS_FILTERS = [
  { value: "", label: "All invoices" },
  { value: "OPEN", label: "Open" },
  { value: "PAID", label: "Paid" },
  { value: "VOID", label: "Void" },
];

/**
 * Billing &amp; Invoices at `/w/admin/billing` (docs/enterprise-v2/ORG-BILLING-BUILD.md step 1a, 28 §4): tabs Account · Invoices · Contract. Read-only.
 * The card on file shows brand and last 4 only (Stripe holds the card). The billing portal stays switched off until Stripe is connected (step 2); LOCAL
 * invoices are labelled Estimate, because no money moved.
 */
export default function BillingPage({ orgId }: { orgId: number }) {
  const [tab, setTab] = useState("account");
  const [billing, setBilling] = useState<Billing | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(null);
    const r = await billingApi.billing(orgId);
    if (r.ok) setBilling(r.data);
    else setFailed(r.message);
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader title="Billing & Invoices" subtitle="How your organization pays, its invoices, and its contract." />
      <div className="space-y-4" data-billing-page>
        {failed ? (
          <ErrorState what="your billing" description={failed} onRetry={() => void load()} />
        ) : billing == null ? (
          <ListSkeleton count={3} label="Loading your billing" />
        ) : (
          <Tabs value={tab} onValueChange={setTab} variant="underline">
            <TabList aria-label="Billing">
              <Tab value="account">Account</Tab>
              <Tab value="invoices">Invoices</Tab>
              <Tab value="contract">Contract</Tab>
            </TabList>
            <TabPanel value="account" className="pt-4">
              <AccountTab b={billing} orgId={orgId} />
            </TabPanel>
            <TabPanel value="invoices" className="pt-4">
              <InvoicesTab orgId={orgId} />
            </TabPanel>
            <TabPanel value="contract" className="pt-4">
              <ContractTab b={billing} />
            </TabPanel>
          </Tabs>
        )}
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b border-line py-2 last:border-0">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}

function AccountTab({ b, orgId }: { b: Billing; orgId: number }) {
  const a = b.account;
  const [opening, setOpening] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const openPortal = async () => {
    setOpening(true);
    setPortalError(null);
    const r = await billingApi.portal(orgId);
    if (r.ok && r.data.url) {
      window.location.assign(r.data.url);
      return;
    }
    setOpening(false);
    setPortalError(r.ok ? "The billing portal didn't open. Try again." : r.message);
  };
  const fee = a ? setupFeeText(a.setupFeeStatus, a.setupFeeAmountMinor, a.currency) : null;
  return (
    <div className="grid gap-3 lg:grid-cols-2" data-billing-account>
      <section className={CARD} aria-label="Account">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[14px] font-bold text-ink">Account</h2>
          <StatePill domain="billing-state" state={b.status} label={STATUS_LABEL[b.status] ?? b.status} />
        </div>
        {a ? (
          <dl className="mt-2 text-[13px]">
            {a.billingEmail ? <Row label="Invoices go to">{a.billingEmail}</Row> : null}
            <Row label="How it's paid">{collectionText(a.collectionMethod)}</Row>
            <Row label="Currency">{a.currency}</Row>
            <Row label="Billed">{a.billingCycle === "YEAR" ? "Every year" : "Every month"}</Row>
            <Row label="This period">
              {day(a.periodStart)} – {day(a.periodEnd)}
            </Row>
            <Row label="Next invoice">{day(a.nextInvoiceOn)}</Row>
            <Row label="Paid through">{day(a.paidThroughOn)}</Row>
            {fee ? <Row label="Setup fee">{fee}</Row> : null}
          </dl>
        ) : (
          <p className="mt-2 text-[13px] text-ink-soft" data-billing-setup>
            Billing is being set up{b.orgName ? ` for ${b.orgName}` : ""}. Your organization will get an invoice each month, paid within 15 days by card or bank
            transfer. Nothing is billed yet.
          </p>
        )}
        <p className="mt-3 text-[12px] text-muted">{b.taxNote}</p>
      </section>

      <section className={CARD} aria-label="Payment method">
        <h2 className="text-[14px] font-bold text-ink">Payment method</h2>
        <p className="mt-2 text-[13px] text-ink">{methodText(b.paymentMethod) ?? "No payment method on file."}</p>
        <p className="mt-1 text-[12px] text-muted">The card itself is held by Stripe; Kiwiply only keeps the brand and the last four digits.</p>
        <div className="mt-3">
          <Button type="button" variant="ghost" disabled={!b.billingConnected || opening} onClick={() => void openPortal()} data-billing-portal>
            {!b.billingConnected ? "Billing isn't connected yet" : opening ? "Opening…" : "Open the billing portal"}
          </Button>
          {portalError && (
            <p role="alert" className="mt-2 text-[12.5px] text-danger-text">
              {portalError}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function ContractTab({ b }: { b: Billing }) {
  const c = b.contract;
  if (!c) return <EmptyState variant="inline" title="No contract yet" description="Your contract prices appear here once Kiwiply adds them. Until then licences show 'Price not set'." />;
  return (
    <section className={CARD} aria-label="Contract" data-billing-contract-tab>
      <dl className="text-[13px]">
        <Row label="Name">{c.name ?? "-"}</Row>
        <Row label="Reference">{c.reference ?? "-"}</Row>
        <Row label="Starts">{day(c.startsAt)}</Row>
        <Row label="Ends">{c.endsAt ? day(c.endsAt) : "No end date"}</Row>
        <Row label="Billed">{c.billingInterval === "YEAR" ? "Every year" : "Every month"}</Row>
      </dl>
    </section>
  );
}

function InvoicesTab({ orgId }: { orgId: number }) {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<InvoicePage | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);

  const load = useCallback(async () => {
    setFailed(null);
    const r = await billingApi.invoices(orgId, status || null, page);
    if (r.ok) setData(r.data);
    else setFailed(r.message);
  }, [orgId, status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (row: InvoiceRow) => {
    if (open === row.id) {
      setOpen(null);
      return;
    }
    setOpen(row.id);
    setDetail(null);
    const r = await billingApi.invoice(orgId, row.id);
    if (r.ok) setDetail(r.data);
  };

  if (failed) return <ErrorState what="the invoices" description={failed} onRetry={() => void load()} />;
  if (data == null) return <TableSkeleton columns={5} label="Loading invoices" />;
  const pages = Math.max(1, Math.ceil(data.total / data.size));

  return (
    <div className="space-y-3" data-billing-invoices>
      <Select
        aria-label="Show"
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(0);
        }}
        options={STATUS_FILTERS}
        className="w-[170px]"
      />
      {data.rows.length === 0 ? (
        <EmptyState variant="inline" title="No invoices yet" description="Invoices appear here once billing is connected." />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius)] border border-line bg-paper">
          <table aria-label="Invoices" className="w-full border-collapse text-[12.5px]">
            <thead className="border-b border-line bg-paper-2/60">
              <tr>
                <th scope="col" className={HEAD}>Invoice</th>
                <th scope="col" className={`${HEAD} hidden md:table-cell`}>Period</th>
                <th scope="col" className={HEAD}>Amount</th>
                <th scope="col" className={HEAD}>Status</th>
                <th scope="col" className={HEAD}>
                  <span className="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <Fragment key={r.id}>
                  <tr className="border-b border-line last:border-0" data-invoice-row={r.id}>
                    <td className="px-3 py-2.5">
                      <span className="block font-semibold text-ink">{r.number}</span>
                      <span className="block text-muted">
                        Issued {day(r.issueDate)}
                        {r.estimate ? " · Estimate" : ""}
                      </span>
                    </td>
                    <td className="hidden px-3 py-2.5 text-ink-soft md:table-cell">
                      {day(r.periodStart)} – {day(r.periodEnd)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-ink">
                      {money(r.amountMinor, r.currency)}
                      {r.amountPaidMinor > 0 && r.amountPaidMinor < r.amountMinor ? <span className="block text-muted">{money(r.amountPaidMinor, r.currency)} paid</span> : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatePill domain="invoice-state" state={r.overdue ? "OVERDUE" : r.status} label={r.overdue ? `Overdue since ${day(r.dueDate)}` : INVOICE_STATUS_LABEL[r.status] ?? r.status} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {r.payUrl ? (
                        <a href={r.payUrl} target="_blank" rel="noopener noreferrer" className={`${buttonVariants("accent", "sm")} mr-2`} data-invoice-pay={r.id}>
                          Pay
                        </a>
                      ) : null}
                      <Button type="button" size="sm" variant="ghost" aria-expanded={open === r.id} onClick={() => void toggle(r)} data-invoice-open={r.id}>
                        {open === r.id ? "Hide" : "Details"}
                      </Button>
                    </td>
                  </tr>
                  {open === r.id ? (
                    <tr className="border-b border-line bg-paper-2/40">
                      <td colSpan={5} className="px-3 py-3">
                        {detail && detail.invoice.id === r.id ? <Lines d={detail} /> : <span className="text-muted">Loading…</span>}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 ? (
        <div className="flex items-center justify-end gap-2 text-[12.5px]">
          <Button type="button" size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-ink-soft">
            Page {page + 1} of {pages}
          </span>
          <Button type="button" size="sm" variant="ghost" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Lines({ d }: { d: InvoiceDetail }) {
  const cur = d.invoice.currency;
  return (
    <div className="space-y-2" data-invoice-lines>
      {d.description ? <p className="text-ink-soft">{d.description}</p> : null}
      <ul className="space-y-1">
        {d.lines.map((l, i) => (
          <li key={i} className="flex flex-wrap justify-between gap-2">
            <span className="text-ink">
              {l.description || LINE_KIND_LABEL[l.kind] || l.kind}
              {l.quantity > 1 && l.unitAmountMinor != null ? <span className="text-muted"> · {l.quantity} × {money(l.unitAmountMinor, cur)}</span> : null}
              {l.detail ? <span className="block text-[12px] text-muted">{l.detail}</span> : null}
            </span>
            <span className="tabular-nums text-ink">{money(l.amountMinor, cur)}</span>
          </li>
        ))}
      </ul>
      {d.payments.length ? (
        <div className="border-t border-line pt-2">
          <p className="text-[12px] font-semibold text-ink-soft">Payments</p>
          <ul className="space-y-1 text-[12.5px]">
            {d.payments.map((p, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2">
                <span className="text-ink-soft">
                  {day(p.occurredAt)} · {p.status === "SUCCEEDED" ? "Paid" : p.status === "FAILED" ? "Failed" : p.status}
                  {p.failureReason ? ` (${p.failureReason})` : ""}
                </span>
                <span className="tabular-nums text-ink">{money(p.amountMinor, p.currency)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
