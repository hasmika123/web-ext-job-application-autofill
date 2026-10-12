"use client";

import { useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Input, SavedTick, Select, cn } from "@kiwiply/ui";
import { MODEL_ID_MESSAGE, SOURCE_LABEL, isModelId } from "@/lib/ai-admin";
import type { Source } from "@/lib/ai-admin";
import { StatusChip } from "@/components/app-v2/common";
import { useAiAdmin } from "./useAiAdmin";
import type { SaveOutcome } from "./useAiAdmin";

/** Small pieces every autosaving control of the AI page shares: the ✓, the inline error, the source chip, the inputs. */

/** The ✓ that follows a control for a moment after its change was saved. */
export function Tick({ k }: { k: string }) {
  const { flash } = useAiAdmin();
  return <SavedTick flash={flash} id={k} className="ml-0.5" />;
}

/** The API's refusal, in red under the control. */
export function FieldError({ k, local }: { k: string; local?: string | null }) {
  const { error } = useAiAdmin();
  const msg = local ?? error(k);
  if (!msg) return null;
  return (
    <p role="alert" className="mt-1 text-[12.5px] leading-snug text-danger">
      {msg}
    </p>
  );
}

/** "Admin / Env / Default" chip and, when an admin value overrides env, the "overrides env · Reset" link. */
export function SourceTag({ source, onReset, what, resetBusy, className }: { source: Source; onReset?: () => void; what: string; resetBusy?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-0.5", className)}>
      <StatusChip tone={source === "db" ? "blue" : "slate"} className="px-2 py-0.5 text-[11px]">
        {SOURCE_LABEL[source]}
      </StatusChip>
      {source === "db" && onReset && (
        <button
          type="button"
          onClick={onReset}
          disabled={resetBusy}
          aria-label={`Reset ${what} to default`}
          title="Reset to default"
          className="inline-flex min-h-11 items-center text-[12px] font-semibold text-v2-blue-ink hover:underline disabled:opacity-60 sm:min-h-0"
        >
          overrides env · Reset
        </button>
      )}
    </span>
  );
}

/**
 * A text / number box that saves on blur or Enter (never per keystroke). Escape puts the saved value back. `onCommit`
 * does the save; a refusal reverts the box (the message shows under it).
 */
export function AutosaveInput({
  k,
  label,
  value,
  onCommit,
  type = "text",
  inputMode,
  placeholder,
  validate,
  disabled,
  className,
  suffix,
}: {
  k: string;
  label: string;
  value: string;
  onCommit: (next: string) => Promise<SaveOutcome> | void;
  type?: "text" | "number";
  inputMode?: "text" | "numeric" | "decimal" | "url";
  placeholder?: string;
  /** Returns a message when the draft is not worth sending. */
  validate?: (draft: string) => string | null;
  disabled?: boolean;
  className?: string;
  suffix?: ReactNode;
}) {
  const a = useAiAdmin();
  const [draft, setDraft] = useState<string | null>(null);
  const [local, setLocal] = useState<string | null>(null);
  const skipBlur = useRef(false);
  const shown = draft ?? a.shown(k, value);

  async function commit() {
    if (draft === null) return;
    const next = draft.trim();
    if (next === value.trim()) {
      setDraft(null);
      setLocal(null);
      return;
    }
    const bad = validate?.(next) ?? null;
    if (bad) {
      setLocal(bad);
      return;
    }
    setLocal(null);
    setDraft(null);
    await onCommit(next);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      skipBlur.current = true;
      void commit().finally(() => {
        skipBlur.current = false;
      });
    } else if (e.key === "Escape") {
      setDraft(null);
      setLocal(null);
    }
  }

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center gap-2">
        <Input
          type={type}
          inputMode={inputMode}
          aria-label={label}
          aria-busy={a.busy(k) || undefined}
          aria-invalid={local || a.error(k) ? true : undefined}
          disabled={disabled}
          placeholder={placeholder}
          value={shown}
          onChange={(e) => {
            setDraft(e.target.value);
            setLocal(null);
            a.clearError(k);
          }}
          onBlur={() => {
            if (!skipBlur.current) void commit();
          }}
          onKeyDown={onKey}
          className="min-w-0 flex-1"
        />
        {suffix}
        <Tick k={k} />
      </div>
      <FieldError k={k} local={local} />
    </div>
  );
}

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
  onCommit: (next: string) => Promise<SaveOutcome> | void;
  blankLabel?: string;
  disabled?: boolean;
}) {
  const a = useAiAdmin();
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

/** A label above a control (used by the stacked / sheet layouts). */
export function LabeledField({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="min-w-0">
      <p id={id} className="mb-1 text-[12.5px] font-semibold text-ink">
        {label}
      </p>
      {children}
      {hint && <p className="mt-1 text-[12px] text-v2-muted">{hint}</p>}
    </div>
  );
}
