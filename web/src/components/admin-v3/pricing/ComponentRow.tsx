"use client";

import { ArrowDownIcon, ArrowUpIcon, Button, FeatureChip, Select, TrashIcon, cn } from "@kiwiply/ui";
import type { AdminOutcome } from "@/lib/admin-client";
import { INTERVAL_LABEL, ROLE_LABEL, ROLES_BY_AUDIENCE, priceFor, type CatalogProduct, type PlanComponent } from "@/lib/admin-plans";
import CommitInput, { parseCount } from "./CommitInput";
import PriceCell from "./PriceCell";

/** Roles that carry a price of their own (the others are covered by the base or the seat base). */
export const PRICED_ROLES = ["OPTIONAL", "SEAT_BASE", "SEAT_OPTIONAL", "FEE"];

/** The intervals a priced component is sold at: a setup fee is one time, everything else follows the version. */
export function priceIntervals(c: PlanComponent, product: CatalogProduct | undefined, versionIntervals: string[]): string[] {
  if (c.role === "FEE" && /SETUP/i.test(product?.code ?? c.productCode ?? "")) return ["ONE_TIME"];
  return versionIntervals;
}

const GUARD_KIND: Record<string, "OPTIONAL" | "SERVICE" | "BASE" | "ONE_TIME"> = { OPTIONAL: "OPTIONAL", SEAT_BASE: "SERVICE", SEAT_OPTIONAL: "SERVICE", FEE: "BASE" };

export interface ComponentRowProps {
  c: PlanComponent;
  index: number;
  count: number;
  audience: string;
  currency: string;
  versionIntervals: string[];
  product?: CatalogProduct;
  /** Read-only (a published version) */
  disabled: boolean;
  /** Set when the row was added because another service needs it. */
  neededBy?: string;
  onEdit: (patch: Partial<PlanComponent>) => Promise<AdminOutcome>;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onPrice: (interval: string, minor: number) => Promise<AdminOutcome>;
}

/** One service of the composition: role, allowance, max quantity, a price per interval for the sellable roles, reorder and remove. */
export default function ComponentRow({ c, index, count, audience, currency, versionIntervals, product, disabled, neededBy, onEdit, onRemove, onMove, onPrice }: ComponentRowProps) {
  const roles = ROLES_BY_AUDIENCE[audience] ?? ROLES_BY_AUDIENCE.INDIVIDUAL;
  const priced = PRICED_ROLES.includes(c.role);
  const productId = c.productId ?? product?.id ?? null;
  const intervals = priceIntervals(c, product, versionIntervals);
  const allowanceUnit = c.unit ? ` ${c.unit}` : "";

  return (
    <li className={cn("rounded-xl border border-line bg-paper p-3 sm:p-4")} aria-label={c.name}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <FeatureChip name={c.name} allowance={c.allowance != null ? `${c.allowance}${allowanceUnit}` : undefined} />
          <p className="mt-1 truncate text-[12px] text-v2-muted">
            {c.featureKey}
            {c.limitKey ? ` · limit ${c.limitKey}` : ""}
            {c.aiBudgetCents > 0 ? " · uses AI" : ""}
          </p>
          {neededBy && <p className="text-[12px] font-semibold text-accent-deep">needs {neededBy} - added</p>}
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" aria-label={`Move ${c.name} up`} disabled={disabled || index === 0} onClick={() => onMove(-1)} className="min-h-11 min-w-11 sm:min-h-0 sm:min-w-0">
            <ArrowUpIcon size={16} />
          </Button>
          <Button type="button" variant="ghost" aria-label={`Move ${c.name} down`} disabled={disabled || index === count - 1} onClick={() => onMove(1)} className="min-h-11 min-w-11 sm:min-h-0 sm:min-w-0">
            <ArrowDownIcon size={16} />
          </Button>
          <Button type="button" variant="ghost" aria-label={`Remove ${c.name}`} disabled={disabled} onClick={onRemove} className="min-h-11 min-w-11 sm:min-h-0 sm:min-w-0">
            <TrashIcon size={16} />
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="min-w-0 text-[12.5px] font-semibold text-ink">
          <span className="mb-1 block">Role</span>
          <Select
            value={c.role}
            disabled={disabled}
            onChange={(role) => void onEdit({ role })}
            aria-label={`${c.name} role`}
            options={roles.map((r) => ({ value: r, label: ROLE_LABEL[r] ?? r }))}
          />
        </label>
        <div className="min-w-0 text-[12.5px] font-semibold text-ink">
          <span className="mb-1 block">Allowance{c.unit ? ` (${c.unit})` : ""}</span>
          <CommitInput
            label={`${c.name} allowance`}
            value={c.allowanceOverride == null ? "" : String(c.allowanceOverride)}
            placeholder={c.allowance != null ? `default ${c.allowance}` : "service default"}
            inputMode="numeric"
            disabled={disabled}
            validate={(t) => (parseCount(t) === undefined ? "Whole number, or blank for the default." : null)}
            onCommit={(t) => onEdit({ allowanceOverride: parseCount(t) ?? null })}
          />
        </div>
        {(c.role === "OPTIONAL" || c.role === "SEAT_OPTIONAL") && (
          <div className="min-w-0 text-[12.5px] font-semibold text-ink">
            <span className="mb-1 block">Max quantity</span>
            <CommitInput
              label={`${c.name} max quantity`}
              value={c.maxQuantity == null ? "" : String(c.maxQuantity)}
              placeholder="service default"
              inputMode="numeric"
              disabled={disabled}
              validate={(t) => (parseCount(t) === undefined ? "Whole number, or blank for the default." : null)}
              onCommit={(t) => onEdit({ maxQuantity: parseCount(t) ?? null })}
            />
          </div>
        )}
      </div>

      {priced && (
        <div className="mt-3">
          {productId == null ? (
            <p className="rounded-lg bg-brown-soft px-3 py-2 text-[12.5px] text-brown-deep">
              No price yet: this service has no product in the catalog, so it stays hidden from buyers until one is created (Catalog, Products).
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {intervals.map((i) => (
                <div key={i} className="min-w-0 text-[12.5px] font-semibold text-ink">
                  <span className="mb-1 block">{INTERVAL_LABEL[i] ?? i}</span>
                  <PriceCell
                    label={`${c.name} ${(INTERVAL_LABEL[i] ?? i).toLowerCase()} price`}
                    currency={currency}
                    interval={i}
                    audience={audience}
                    kind={i === "ONE_TIME" ? "ONE_TIME" : (GUARD_KIND[c.role] ?? "OPTIONAL")}
                    aiBudgetCents={i === "MONTH" || i === "ONE_TIME" ? c.aiBudgetCents : null}
                    price={priceFor(c.prices, i, currency)}
                    disabled={disabled || i === "YEAR"}
                    disabledReason={i === "YEAR" ? "Annual follows the discount" : undefined}
                    onCommit={(minor) => onPrice(i, minor)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
