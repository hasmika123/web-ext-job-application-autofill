"use client";

import { useState } from "react";
import { Select } from "@kiwiply/ui";
import { MODEL_ID_MESSAGE, isModelId } from "@/lib/ai-admin";
import { AutosaveInput, FieldError, Tick } from "../common/controls";
import { useAdminSave } from "../common/useAdminSave";
import type { AdminSaveOutcome } from "../common/useAdminSave";

/**
 * The AI page's controls. The generic ones (the ✓, the inline error, the source chip, the autosave box, the labelled
 * field) moved to the admin kit (`../common/controls`, E2E-A15.0) and are re-exported here so the page's imports do not
 * change; only the model chooser, which knows what a model id is, stays.
 */
export { AutosaveInput, FieldError, LabeledField, SourceTag, Tick } from "../common/controls";

const OTHER = "\u0000other";

/**
 * A model chooser: the provider's models, the current value (even when the list does not have it) and "Other…" for a
 * free-text id checked against the API's model-id rule. `blankLabel` adds a "no value" entry (a fallback model).
 */
export function ModelPicker({
  k,
  label,
  models,
  value,
  onCommit,
  blankLabel,
  disabled,
}: {
  k: string;
  label: string;
  models: string[];
  value: string;
  onCommit: (next: string) => Promise<AdminSaveOutcome> | void;
  blankLabel?: string;
  disabled?: boolean;
}) {
  const a = useAdminSave();
  const [other, setOther] = useState(false);
  const shown = a.shown(k, value);
  const list = shown && !models.includes(shown) ? [shown, ...models] : models;
  const options = [
    ...(blankLabel ? [{ value: "", label: blankLabel }] : []),
    ...list.map((m) => ({ value: m, label: m })),
    { value: OTHER, label: "Other…" },
  ];

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <Select
          aria-label={label}
          value={other ? OTHER : shown}
          options={options}
          disabled={disabled}
          onChange={(v) => {
            if (v === OTHER) {
              setOther(true);
              return;
            }
            setOther(false);
            void onCommit(v);
          }}
          className="min-w-0 flex-1"
        />
        <Tick k={k} />
      </div>
      {other && (
        <div className="mt-1.5">
          <AutosaveInput
            k={`${k}:other`}
            label={`${label} (other model id)`}
            value=""
            placeholder="e.g. gemini-2.5-pro"
            validate={(d) => (isModelId(d) ? null : MODEL_ID_MESSAGE)}
            onCommit={async (next) => {
              const out = await onCommit(next);
              if (!out || out.ok) setOther(false);
              return out ?? { ok: true as const };
            }}
          />
        </div>
      )}
      <FieldError k={k} />
    </div>
  );
}
