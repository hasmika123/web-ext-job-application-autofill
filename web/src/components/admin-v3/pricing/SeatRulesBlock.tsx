"use client";

import type { ReactNode } from "react";
import { Field, Select } from "@kiwiply/ui";
import type { AdminOutcome } from "@/lib/admin-client";
import type { CatalogProduct, PlanVersion, SeatRules } from "@/lib/admin-plans";
import CommitInput, { parseCount } from "./CommitInput";

const NONE = "";

function ProductSelect({ label, value, products, disabled, onPick }: { label: string; value: number | null | undefined; products: CatalogProduct[]; disabled: boolean; onPick: (id: number | null) => void }) {
  return (
    <Select
      value={value == null ? NONE : String(value)}
      disabled={disabled}
      onChange={(v) => onPick(v === NONE ? null : Number(v))}
      aria-label={label}
      placeholder="None"
      options={[{ value: NONE, label: "None" }, ...products.map((p) => ({ value: String(p.id), label: `${p.name} (${p.code})` }))]}
    />
  );
}

/**
 * The organization half of the editor (K4.6; 04 section 9). Seat rules (minimum seats, the seat-base license, the setup fee and the
 * optional platform fee) are the version's `seatRules`; the SEAT_BASE and FEE components below them carry the prices. An
 * organization plan is expected to carry a setup fee (E3). The API does not refuse a publish without one yet (see
 * decisions-for-user), so this block says so; if the API ever answers 422 the publish sheet shows it inline.
 */
export default function SeatRulesBlock({
  version,
  products,
  disabled,
  onPatch,
  rows,
}: {
  version: PlanVersion;
  products: CatalogProduct[];
  disabled: boolean;
  onPatch: (fields: { seatRules: SeatRules }) => Promise<AdminOutcome>;
  rows: ReactNode[];
}) {
  const rules: SeatRules = version.seatRules ?? {};
  const save = (patch: Partial<SeatRules>) => onPatch({ seatRules: { ...rules, ...patch } });
  const seatProducts = products.filter((p) => p.active && p.kind === "BASE_LICENSE");
  const feeProducts = products.filter((p) => p.active && p.kind === "FEE");
  const setupProducts = feeProducts.filter((p) => /SETUP/i.test(p.code));
  const platformProducts = feeProducts.filter((p) => !/SETUP/i.test(p.code));
  const noSetup = rules.setupFeeProductId == null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Seat base license" hint="Every consultant seat starts from this license.">
          <ProductSelect label="Seat base product" value={rules.seatBaseProductId} products={seatProducts} disabled={disabled} onPick={(id) => void save({ seatBaseProductId: id })} />
        </Field>
        <Field label="Minimum seats" hint="Blank = no minimum.">
          <CommitInput
            label="Minimum seats"
            value={rules.minSeats == null ? "" : String(rules.minSeats)}
            inputMode="numeric"
            disabled={disabled}
            validate={(t) => (parseCount(t) === undefined ? "A whole number, or blank." : null)}
            onCommit={(t) => save({ minSeats: parseCount(t) ?? null })}
          />
        </Field>
        <Field label="Setup fee (one time, required)" hint="Charged once when the organization is set up.">
          <ProductSelect label="Setup fee product" value={rules.setupFeeProductId} products={setupProducts} disabled={disabled} onPick={(id) => void save({ setupFeeProductId: id })} />
        </Field>
        <Field label="Platform fee (optional)" hint="A recurring fee for the organization itself.">
          <ProductSelect label="Platform fee product" value={rules.platformFeeProductId} products={platformProducts} disabled={disabled} onPick={(id) => void save({ platformFeeProductId: id })} />
        </Field>
      </div>
      {rules.maxSeatsSetting && (
        <p className="text-[12.5px] text-v2-muted">
          Maximum seats follow the setting <code>{rules.maxSeatsSetting}</code> (change it under Settings).
        </p>
      )}
      {noSetup && (
        <p role="note" className="rounded-xl bg-brown-soft p-3 text-[13px] text-brown-deep">
          No setup fee is chosen. An organization plan is expected to carry one (E3: always charged); the API does not enforce it at publish yet.
        </p>
      )}
      {rows.length > 0 ? <ul className="space-y-3">{rows}</ul> : <p className="text-[13px] text-v2-muted">Add the seat base license and any fee as services (Add service).</p>}
    </div>
  );
}
