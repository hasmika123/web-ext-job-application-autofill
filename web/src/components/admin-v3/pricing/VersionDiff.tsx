"use client";

import type { ReactNode } from "react";
import { ArrowRightIcon, MoneyText, cn } from "@kiwiply/ui";
import { ROLE_LABEL, bpText, type DiffRow } from "@/lib/admin-plans";

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** One value of a diff row in words; money paths are formatted from minor units (no arithmetic). */
function Value({ path, v, currency }: { path: string; v: unknown; currency: string }): ReactNode {
  if (v === null || v === undefined) return <span className="text-v2-muted">none</span>;
  if (typeof v === "number") {
    if (/Cents$/.test(path)) return <MoneyText minor={v} currency={currency} />;
    if (/Bp$/.test(path)) return <>{bpText(v)}</>;
    return <span className="tabular-nums">{v.toLocaleString("en-US")}</span>;
  }
  if (Array.isArray(v)) return <>{v.join(", ") || "none"}</>;
  if (typeof v === "string") return <>{ROLE_LABEL[v] ?? v}</>;
  return <>{JSON.stringify(v)}</>;
}

const Pair = ({ a, b, aLabel, bLabel }: { a: ReactNode; b: ReactNode; aLabel?: string; bLabel?: string }) => (
  <span className="inline-flex flex-wrap items-center gap-1.5">
    <span aria-label={aLabel} className="rounded-md bg-paper-2 px-1.5 py-0.5 line-through decoration-v2-muted/60">
      {a}
    </span>
    <ArrowRightIcon size={13} aria-hidden className="text-v2-muted" />
    <span aria-label={bLabel} className="rounded-md bg-accent-soft px-1.5 py-0.5 font-semibold text-accent-deep">
      {b}
    </span>
  </span>
);

/** "components.ai.credits_extra.allowance" -> { what: "ai.credits_extra", field: "allowance" } */
function describe(path: string): { what: string; field: string } {
  if (path.startsWith("components.")) {
    const rest = path.slice("components.".length);
    const known = ["role", "allowance", "maxQuantity", "componentDiscountBp", "prices"].find((f) => rest.endsWith(`.${f}`));
    return known ? { what: rest.slice(0, rest.length - known.length - 1), field: known } : { what: rest, field: "service" };
  }
  if (path === "baseProduct.prices") return { what: "Base price", field: "prices" };
  return { what: path, field: "" };
}

/**
 * The server's differences between two versions (`GET .../compare`), one row each: services added or removed, allowances, prices per
 * interval and currency (before, then after), the AI budget cap, the annual discount, the intervals. Nothing is computed here: a price
 * change shows the two amounts, never a total.
 */
export default function VersionDiff({ diff, aLabel = "before", bLabel = "after", currency }: { diff: DiffRow[]; aLabel?: string; bLabel?: string; currency: string }) {
  if (diff.length === 0) return <p className="text-[13px] text-v2-muted">No differences: both versions sell the same thing.</p>;
  return (
    <ul className="divide-y divide-line rounded-xl border border-line" aria-label="Differences">
      {diff.flatMap((row) => {
        const { what, field } = describe(row.path);
        if (field === "service") {
          const added = row.a == null;
          return [
            <li key={row.path} data-diff={row.path} className="flex flex-wrap items-center justify-between gap-2 p-3 text-[13px]">
              <span className="font-semibold text-ink">{what}</span>
              <span className={cn("font-semibold", added ? "text-accent-deep" : "text-danger-text")}>{added ? `added as ${ROLE_LABEL[String(row.b)] ?? row.b}` : `removed (was ${ROLE_LABEL[String(row.a)] ?? row.a})`}</span>
            </li>,
          ];
        }
        if (field === "prices" && (isObj(row.a) || isObj(row.b))) {
          const a = isObj(row.a) ? row.a : {};
          const b = isObj(row.b) ? row.b : {};
          return [...new Set([...Object.keys(a), ...Object.keys(b)])]
            .filter((k) => a[k] !== b[k])
            .map((k) => {
              const [interval, cur] = k.split("/");
              const money = (v: unknown) => (typeof v === "number" ? <MoneyText minor={v} currency={cur || currency} /> : <span className="text-v2-muted">none</span>);
              return (
                <li key={`${row.path}:${k}`} data-diff={`${row.path}:${k}`} className="flex flex-wrap items-center justify-between gap-2 p-3 text-[13px]">
                  <span>
                    <span className="font-semibold text-ink">{what}</span>
                    <span className="text-v2-muted"> · {interval?.toLowerCase()} price</span>
                  </span>
                  <Pair a={money(a[k])} b={money(b[k])} aLabel={aLabel} bLabel={bLabel} />
                </li>
              );
            });
        }
        return [
          <li key={row.path} data-diff={row.path} className="flex flex-wrap items-center justify-between gap-2 p-3 text-[13px]">
            <span>
              <span className="font-semibold text-ink">{what}</span>
              {field && <span className="text-v2-muted"> · {field}</span>}
            </span>
            <Pair a={<Value path={row.path} v={row.a} currency={currency} />} b={<Value path={row.path} v={row.b} currency={currency} />} aLabel={aLabel} bLabel={bLabel} />
          </li>,
        ];
      })}
    </ul>
  );
}
