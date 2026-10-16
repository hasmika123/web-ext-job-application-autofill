"use client";

import { MoneyText } from "@kiwiply/ui";
import { shortDate } from "@/lib/subscription/copy";
import type { Invoice } from "@/lib/subscription/types";

/** The account's invoices (GET /api/billing/invoices, newest first, at most 36): number, date, status, amount, and the lines on tap. */
export default function InvoiceList({ invoices }: { invoices: Invoice[] | null | "error" }) {
  if (invoices === null) return <p className="text-[13px] text-muted">Loading invoices...</p>;
  if (invoices === "error") return <p className="text-[13px] text-muted">Invoices aren't available right now.</p>;
  if (invoices.length === 0) return <p className="text-[13px] text-muted">No invoices yet. Your first one appears after your first payment.</p>;
  return (
    <ul className="flex flex-col divide-y divide-line" data-testid="invoice-list">
      {invoices.map((inv) => (
        <li key={inv.number} className="py-2.5">
          <details>
            <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-x-3 text-[14px]">
              <span className="font-medium text-ink">
                {inv.number} <span className="font-normal text-muted">· {shortDate(inv.paidAt ?? inv.periodStart)}</span>
              </span>
              <span className="flex items-baseline gap-3">
                <span className="text-[12.5px] capitalize text-muted">{inv.status}</span>
                <MoneyText minor={inv.amountPaidMinor} currency={inv.currency} />
              </span>
            </summary>
            <ul className="mt-2 flex flex-col gap-1 pl-3 text-[13px] text-ink-soft">
              {inv.lines.map((l, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3">
                  <span>
                    {l.description}
                    {l.quantity > 1 ? ` x${l.quantity}` : ""}
                    {l.proration ? " (prorated)" : ""}
                  </span>
                  <MoneyText minor={l.amountMinor} currency={inv.currency} tone="muted" />
                </li>
              ))}
            </ul>
            {inv.hostedUrl ? (
              <a href={inv.hostedUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block pl-3 text-[13px] font-semibold text-accent-deep hover:underline">
                View invoice
              </a>
            ) : null}
          </details>
        </li>
      ))}
    </ul>
  );
}
