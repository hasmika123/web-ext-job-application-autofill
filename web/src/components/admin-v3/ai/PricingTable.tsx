"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { BottomSheet, Button, ChevronRightIcon, Input, PlusIcon, cn } from "@kiwiply/ui";
import { MODEL_ID_MESSAGE, isModelId, parseUsdToMicros, pricePerMtok } from "@/lib/ai-admin";
import type { AiPriceItem } from "@/lib/ai-admin";
import { AutosaveInput, FieldError, LabeledField, SourceTag } from "./controls";
import { useAiAdmin } from "./useAiAdmin";
import { useAiOps } from "./useAiOps";
import { useWide } from "./useNarrow";

const TH = "whitespace-nowrap px-2.5 py-2.5 text-left text-[12px] font-medium text-v2-muted";
const TD = "px-2.5 py-2.5 align-top";
const PARTS = [
  { part: "input", label: "Input", field: "inputPerMtokMicros" },
  { part: "cached", label: "Cached input", field: "cachedPerMtokMicros" },
  { part: "output", label: "Output", field: "outputPerMtokMicros" },
] as const;
type Part = (typeof PARTS)[number]["part"];

const DOLLARS = "Enter dollars per million tokens, like 0.10.";

function current(item: AiPriceItem) {
  return { input: item.inputPerMtokMicros.value, cached: item.cachedPerMtokMicros.value, output: item.outputPerMtokMicros.value };
}

/** One price cell: dollars per million tokens, saved on blur / Enter as whole micros (all three go together, the API needs them). */
function PriceCell({ item, part, label }: { item: AiPriceItem; part: Part; label: string }) {
  const ops = useAiOps();
  const now = current(item);
  return (
    <AutosaveInput
      k={`price:${item.model}:${part}`}
      label={`${item.model} ${label.toLowerCase()} price in dollars per million tokens`}
      inputMode="decimal"
      value={pricePerMtok(now[part])}
      validate={(d) => (parseUsdToMicros(d) === null ? DOLLARS : null)}
      onCommit={(text) => {
        const micros = parseUsdToMicros(text);
        if (micros === null || micros === now[part]) return;
        return ops.putPrice(item, { ...now, [part]: micros }, part);
      }}
      suffix={<span className="text-[11px] text-v2-muted">$</span>}
    />
  );
}

function PriceSource({ item }: { item: AiPriceItem }) {
  const a = useAiAdmin();
  const ops = useAiOps();
  const key = `price:${item.model}:reset`;
  return (
    <div>
      <SourceTag source={item.custom ? "db" : "default"} what={`${item.model} price`} resetBusy={a.busy(key)} onReset={() => void ops.resetPrice(item)} />
      <FieldError k={key} />
    </div>
  );
}

function AddPrice() {
  const ops = useAiOps();
  const a = useAiAdmin();
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState("");
  const [vals, setVals] = useState({ input: "", cached: "", output: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const id = model.trim();
    if (!isModelId(id)) return setErr(MODEL_ID_MESSAGE);
    if (a.config.prices.some((p) => p.model === id)) return setErr("That model already has a price. Edit it in the table.");
    const input = parseUsdToMicros(vals.input);
    const cached = parseUsdToMicros(vals.cached);
    const output = parseUsdToMicros(vals.output);
    if (input === null || cached === null || output === null) return setErr(DOLLARS);
    setErr(null);
    setBusy(true);
    const out = await ops.savePrice(id, { input, cached, output }, null, "price:new");
    setBusy(false);
    if (out.ok) {
      setOpen(false);
      setModel("");
      setVals({ input: "", cached: "", output: "" });
    } else setErr(out.error);
  }

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" className="min-h-11 sm:min-h-0" onClick={() => setOpen(true)}>
        <PlusIcon size={14} className="mr-1" /> Add a model price
      </Button>
    );
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="rounded-xl border border-v2-line p-3.5">
      <p className="mb-2 text-[13px] font-semibold text-ink">Add a model price</p>
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <Input aria-label="Model id" placeholder="e.g. qwen3:8b" value={model} onChange={(e) => setModel(e.target.value)} autoFocus />
        {PARTS.map((p) => (
          <Input
            key={p.part}
            aria-label={`New ${p.label.toLowerCase()} price in dollars per million tokens`}
            placeholder={`${p.label} $/MTok`}
            inputMode="decimal"
            value={vals[p.part]}
            onChange={(e) => setVals((v) => ({ ...v, [p.part]: e.target.value }))}
          />
        ))}
      </div>
      {err && (
        <p role="alert" className="mt-2 text-[12.5px] text-danger">
          {err}
        </p>
      )}
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="accent" size="sm" disabled={busy}>
          {busy ? "Adding…" : "Add price"}
        </Button>
      </div>
    </form>
  );
}

function PriceCard({ item, onOpen }: { item: AiPriceItem; onOpen: (model: string, el: HTMLButtonElement) => void }) {
  const now = current(item);
  return (
    <li className="rounded-xl border border-v2-line bg-paper p-3.5">
      <button
        type="button"
        onClick={(e) => onOpen(item.model, e.currentTarget)}
        aria-label={`Edit ${item.model} price`}
        className="flex min-h-11 w-full items-center justify-between gap-2 text-left"
      >
        <span className="min-w-0 text-[13px] leading-snug text-ink-soft">
          <span className="block break-all text-[14px] font-bold text-ink">{item.model}</span>
          <span className="block">
            in ${pricePerMtok(now.input)} · cached ${pricePerMtok(now.cached)} · out ${pricePerMtok(now.output)} · {item.custom ? "admin" : "default"}
          </span>
        </span>
        <ChevronRightIcon className="h-4 w-4 flex-none text-v2-muted" />
      </button>
    </li>
  );
}

/**
 * Pricing (USD per million tokens): the code defaults plus every price the admin stored. Cells save on blur with a ✓ and
 * an Undo; "Reset" puts the code default back (or drops a model that has none). From `xl` a table, below it cards with a
 * sheet editor. An unpriced model is costed at the dearest Flash rate - over-counted, never free.
 */
export default function PricingTable() {
  const a = useAiAdmin();
  const wide = useWide();
  const prices = a.config.prices;
  const [open, setOpen] = useState<string | null>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const opening = prices.find((p) => p.model === open) ?? null;

  return (
    <div>
      {wide ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead>
              <tr className="bg-[#F6F8FC]">
                <th scope="col" className={cn(TH, "rounded-l-lg pl-3")}>Model</th>
                {PARTS.map((p) => (
                  <th key={p.part} scope="col" className={TH}>{p.label}</th>
                ))}
                <th scope="col" className={cn(TH, "rounded-r-lg")}>Source</th>
              </tr>
            </thead>
            <tbody>
              {prices.map((item) => (
                <tr key={item.model} className="border-b border-v2-line/70 last:border-b-0">
                  <th scope="row" className={cn(TD, "pl-3 text-left font-mono text-[12.5px] font-semibold text-ink")}>
                    {item.model}
                  </th>
                  {PARTS.map((p) => (
                    <td key={p.part} className={cn(TD, "w-[130px]")}>
                      <PriceCell item={item} part={p.part} label={p.label} />
                    </td>
                  ))}
                  <td className={cn(TD, "w-[170px]")}>
                    <PriceSource item={item} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="space-y-3">
          {prices.map((item) => (
            <PriceCard
              key={item.model}
              item={item}
              onOpen={(model, el) => {
                returnTo.current = el;
                setOpen(model);
              }}
            />
          ))}
        </ul>
      )}

      <div className="mt-4 space-y-3">
        <AddPrice />
        <p className="text-[12.5px] text-v2-muted">Unpriced models are costed at the dearest Flash rate (over-counted, never free).</p>
      </div>

      <BottomSheet
        id="ai-price-sheet"
        open={opening !== null}
        onClose={() => setOpen(null)}
        title={opening ? `${opening.model} price` : "Price"}
        description="USD per million tokens. Changes save as you make them."
        returnFocusTo={returnTo}
      >
        {opening && (
          <div className="space-y-4 pb-4">
            {PARTS.map((p) => (
              <LabeledField key={p.part} label={p.label}>
                <PriceCell item={opening} part={p.part} label={p.label} />
              </LabeledField>
            ))}
            <LabeledField label="Source">
              <PriceSource item={opening} />
            </LabeledField>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
