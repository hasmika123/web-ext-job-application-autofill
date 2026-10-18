"use client";

import type { PreviewImpact } from "@/lib/admin-plans";

const when = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

/**
 * "Impact if published" (04 section 3): who stays on which version, when new buyers get this one, the catalog version it becomes
 * and the Stripe objects publishing would create (with their idempotency keys). Counts and dates are the API's; nothing priced is
 * computed here. The API makes a version live when it is published (P-07), so there is no effective-date picker.
 */
export default function ImpactBlock({ impact, version, liveVersion }: { impact: PreviewImpact; version: number; liveVersion?: number | null }) {
  const olds = Object.entries(impact.subscribersByVersion ?? {})
    .filter(([v]) => Number(v) !== version)
    .sort((a, b) => Number(b[0]) - Number(a[0]));
  const from = when(impact.newSignupsFrom);
  return (
    <div className="space-y-2 text-[13px] text-ink">
      <ul className="space-y-1">
        {olds.length === 0 ? (
          <li>Nobody is subscribed to an earlier version.</li>
        ) : (
          olds.map(([v, n]) => (
            <li key={v}>
              <span className="font-semibold tabular-nums">{n.toLocaleString("en-US")}</span> on v{v} keep v{v}
              {impact.grandfathered ? " (grandfathered, nothing changes for them)" : ""}
              {liveVersion != null && Number(v) === liveVersion ? " - the live version" : ""}
            </li>
          ))
        )}
        <li>
          New sign-ups get v{version}
          {from ? ` from ${from}` : " when it is published"}.
        </li>
        <li>
          Catalog version becomes <span className="font-semibold tabular-nums">v{impact.catalogVersionAfter}</span>.
        </li>
      </ul>
      {impact.stripeObjectsToCreate.length > 0 ? (
        <div>
          <p className="font-semibold">
            Stripe prices to create: <span className="tabular-nums">{impact.stripeObjectsToCreate.length}</span>
            {!impact.stripeEnabled && <span className="font-normal text-v2-muted"> (none are created while Stripe is off)</span>}
          </p>
          <ul className="mt-1 space-y-0.5 text-[12px] text-v2-muted">
            {impact.stripeObjectsToCreate.map((o, i) => (
              <li key={`${o.idempotencyKey ?? o.productCode}-${i}`}>
                {o.productCode} · {o.interval.toLowerCase()} · {o.currency}
                {o.idempotencyKey ? ` · ${o.idempotencyKey}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-v2-muted">No new Stripe prices are needed.</p>
      )}
    </div>
  );
}
