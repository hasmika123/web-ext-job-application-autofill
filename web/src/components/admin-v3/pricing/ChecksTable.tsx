"use client";

import { CheckIcon, MoneyText, XCircleIcon, cn } from "@kiwiply/ui";
import { bpText, type Levers, type PreviewCheck } from "@/lib/admin-plans";

export const CHECK_LABEL: Record<string, string> = {
  deps: "Dependencies",
  structure: "Structure",
  prices: "Prices present",
  margin: "Margin floor",
  presets: "Presets above individual",
};

const asNumber = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const asLevers = (v: unknown): Levers | null => (v && typeof v === "object" ? (v as Levers) : null);

/** One failure the API listed, in words: the facts it sent, the margin vs the floor, and the lever that would pass it. */
export function FailureLine({ item, currency }: { item: Record<string, unknown>; currency: string }) {
  const key = typeof item.featureKey === "string" ? item.featureKey : typeof item.productCode === "string" ? item.productCode : null;
  const margin = asNumber(item.marginBp);
  const floor = asNumber(item.floorBp);
  const levers = asLevers(item.levers);
  const requires = typeof item.requires === "string" ? item.requires : null;
  const rest = Object.entries(item).filter(([k, v]) => !["featureKey", "productCode", "interval", "currency", "marginBp", "floorBp", "levers", "requires", "code"].includes(k) && (typeof v === "string" || typeof v === "number" || typeof v === "boolean"));
  return (
    <li className="text-[12.5px] leading-snug text-danger-text">
      {key && <span className="font-semibold">{key}</span>}
      {typeof item.interval === "string" && <span> · {item.interval.toLowerCase()}</span>}
      {requires && <span> needs {requires}</span>}
      {margin !== null && (
        <span>
          {" "}
          · margin {bpText(margin)}
          {floor !== null && <> below the {bpText(floor)} floor</>}
        </span>
      )}
      {levers?.minPriceMinor != null && (
        <span className="font-semibold">
          {" "}
          · raise the price to at least <MoneyText minor={levers.minPriceMinor} currency={currency} />
        </span>
      )}
      {levers?.maxAiBudgetCents != null && (
        <span className="font-semibold">
          {" "}
          · or cut the AI budget to <MoneyText minor={levers.maxAiBudgetCents} currency={currency} /> or less
        </span>
      )}
      {levers?.maxDiscountBp != null && <span className="font-semibold"> · or an annual discount of at most {bpText(levers.maxDiscountBp)}</span>}
      {rest.map(([k, v]) => (
        <span key={k} className="text-v2-muted">
          {" "}
          · {k}: {String(v)}
        </span>
      ))}
    </li>
  );
}

/**
 * The publish gates (04 section 3 "Checks"): deps, structure, prices, margin and presets, each ✓ or ✗ with the failures the API
 * listed and the levers that would pass them. A ✗ does not block editing; it blocks Publish without an override reason.
 */
export default function ChecksTable({ checks, currency, extra }: { checks: PreviewCheck[]; currency: string; extra?: { label: string; ok: boolean; failing?: Record<string, unknown>[] | null }[] }) {
  const rows = [...checks.map((c) => ({ id: c.id, label: CHECK_LABEL[c.id] ?? c.id, ok: c.ok, failing: c.failing })), ...(extra ?? []).map((e) => ({ id: e.label, ...e }))];
  return (
    <table className="w-full text-left text-[13px]">
      <caption className="sr-only">Publish checks</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Check</th>
          <th scope="col">Result</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((r) => (
          <tr key={r.id} data-check={r.id} data-ok={r.ok}>
            <th scope="row" className="py-2 pr-3 align-top font-semibold text-ink">
              {r.label}
            </th>
            <td className="py-2 align-top">
              <span className={cn("inline-flex items-center gap-1 font-semibold", r.ok ? "text-accent-deep" : "text-danger-text")}>
                {r.ok ? <CheckIcon size={14} aria-hidden /> : <XCircleIcon size={14} aria-hidden />}
                {r.ok ? "Pass" : "Fails"}
              </span>
              {!r.ok && r.failing && r.failing.length > 0 && (
                <ul className="mt-1 space-y-1">
                  {r.failing.map((f, i) => (
                    <FailureLine key={i} item={f} currency={currency} />
                  ))}
                </ul>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
