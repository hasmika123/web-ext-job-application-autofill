"use client";

import { useState } from "react";
import { Button, Input, PlusIcon, TrashIcon } from "@kiwiply/ui";
import type { AdminOutcome } from "@/lib/admin-client";
import type { PlanComponent, PlanPreset } from "@/lib/admin-plans";
import CommitInput from "./CommitInput";

const MAX_PRESETS = 12; // config-literal-ok: the API caps a version at 12 presets (PlanService.checkPresets)

/** "Power user" -> "POWER_USER" (1 to 40 characters, unique within the version). */
export function presetKey(name: string, taken: ReadonlySet<string>): string {
  const base = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 36) || "PRESET";
  let key = base;
  for (let n = 2; taken.has(key); n += 1) key = `${base}_${n}`;
  return key;
}

/**
 * Presets (shortcuts, 04 section 7): a name and a quantity per optional add-on. A preset carries NO price (S-05): customers see
 * it as one-tap chips that tick the add-ons. Saved with the draft (PATCH presets).
 */
export default function PresetsEditor({
  presets,
  optional,
  disabled,
  onSave,
}: {
  presets: PlanPreset[];
  optional: PlanComponent[];
  disabled: boolean;
  onSave: (next: PlanPreset[]) => Promise<AdminOutcome>;
}) {
  const [name, setName] = useState("");
  const taken = new Set(presets.map((p) => p.key));

  const setQty = (p: PlanPreset, featureKey: string, qty: number): PlanPreset => {
    const rest = p.addons.filter((a) => a.featureKey !== featureKey);
    return { ...p, addons: qty > 0 ? [...rest, { featureKey, quantity: qty }] : rest };
  };

  return (
    <div className="space-y-3">
      {presets.length === 0 && <p className="text-[13px] text-v2-muted">No presets. A preset is a one-tap shortcut for a popular combination of add-ons; it never has a price of its own.</p>}
      <ul className="space-y-3">
        {presets.map((p) => (
          <li key={p.key} className="rounded-xl border border-line bg-paper p-3">
            <div className="flex items-start gap-2">
              <CommitInput
                label={`${p.key} name`}
                value={p.name}
                disabled={disabled}
                validate={(t) => (t.length === 0 || t.length > 60 ? "1 to 60 characters." : null)}
                onCommit={(t) => onSave(presets.map((x) => (x.key === p.key ? { ...x, name: t } : x)))}
                className="flex-1"
              />
              <Button type="button" variant="ghost" aria-label={`Remove preset ${p.name}`} disabled={disabled} onClick={() => void onSave(presets.filter((x) => x.key !== p.key))} className="min-h-11 min-w-11 sm:min-h-0 sm:min-w-0">
                <TrashIcon size={16} />
              </Button>
            </div>
            {optional.length === 0 ? (
              <p className="mt-2 text-[12.5px] text-v2-muted">Add an optional add-on first.</p>
            ) : (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {optional.map((o) => {
                  const q = p.addons.find((a) => a.featureKey === o.featureKey)?.quantity ?? 0;
                  return (
                    <div key={o.featureKey} className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="min-w-0 truncate">{o.name}</span>
                      <CommitInput
                        label={`${p.name} quantity of ${o.name}`}
                        value={String(q)}
                        inputMode="numeric"
                        disabled={disabled}
                        validate={(t) => (/^\d{1,2}$/.test(t) && (o.maxQuantity == null || Number(t) <= o.maxQuantity) ? null : `0 to ${o.maxQuantity ?? 99}.`)}
                        onCommit={(t) => onSave(presets.map((x) => (x.key === p.key ? setQty(x, o.featureKey, Number(t)) : x)))}
                        className="w-24 flex-none"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </li>
        ))}
      </ul>
      {!disabled && presets.length < MAX_PRESETS && (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            void onSave([...presets, { key: presetKey(name, taken), name: name.trim(), addons: [] }]).then((out) => out.ok && setName(""));
          }}
        >
          <Input aria-label="New preset name" placeholder="Preset name, e.g. Power user" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
          <Button type="submit" variant="accent-soft" disabled={!name.trim()} className="min-h-11 gap-1 sm:min-h-0">
            <PlusIcon size={14} /> Add preset
          </Button>
        </form>
      )}
    </div>
  );
}
