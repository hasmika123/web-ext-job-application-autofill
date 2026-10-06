import { billingLabel, day, money, periodLabel, STATUS_LABEL, STATUS_PILL, type CustomerDetail } from "@/lib/customers";
import CustomerNoteForm from "@/components/admin/CustomerNoteForm";

/**
 * The Billing section on an admin user page (Phase 9.C1): where the customer stands, then a
 * timeline of what Stripe told us and what admins noted, newest first. Notes can't be edited —
 * the timeline is a record.
 */
export default function CustomerBilling({ login, detail }: { login: string; detail: CustomerDetail | null }) {
  const c = detail?.customer ?? null;
  const timeline = detail?.timeline ?? [];

  return (
    <section id="billing" className="scroll-mt-20 rounded-[var(--radius)] border border-line bg-paper p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Billing</h2>
        {c?.stripeUrl && (
          <a href={c.stripeUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-accent-deep hover:underline">
            Open in Stripe ↗
          </a>
        )}
      </div>

      {detail == null ? (
        <p className="mt-3 text-sm text-ink-soft">Couldn&apos;t load billing.</p>
      ) : c == null ? (
        <p className="mt-3 text-sm text-ink-soft">Not a paying customer.</p>
      ) : (
        <dl className="mt-3 grid gap-px overflow-hidden rounded-[var(--radius)] border border-line bg-line sm:grid-cols-4">
          <Item label="Status">
            <span title={c.stripeStatus ?? undefined} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_PILL[c.statusGroup]}`}>
              {STATUS_LABEL[c.statusGroup]}
            </span>
          </Item>
          <Item label="Billing">{billingLabel(c.billing)}</Item>
          <Item label="Period">{periodLabel(c)}</Item>
          <Item label="Total paid">{money(c.totalPaidCents, c.currency)}</Item>
        </dl>
      )}

      <h3 className="mt-5 text-[12px] font-semibold uppercase tracking-wide text-ink-soft">Timeline</h3>
      {timeline.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">Nothing yet.</p>
      ) : (
        <ol className="mt-2 flex flex-col">
          {timeline.map((e, i) => (
            <li key={i} className="flex gap-3 border-b border-line py-2.5 last:border-0">
              <span className="w-[86px] shrink-0 text-[12px] text-ink-soft">{day(e.at)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className={`text-sm ${e.kind === "NOTE" ? "font-semibold text-ink" : "text-ink"}`}>{e.title}</span>
                  {e.amountCents != null && <span className="text-sm font-medium text-ink-soft">{money(e.amountCents, e.currency)}</span>}
                  {e.failed && <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-semibold text-danger">Not applied</span>}
                </div>
                {e.body && <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-soft">{e.body}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}

      <CustomerNoteForm login={login} />
    </section>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-paper px-4 py-3">
      <dt className="text-[11px] uppercase tracking-wide text-ink-soft">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{children}</dd>
    </div>
  );
}
